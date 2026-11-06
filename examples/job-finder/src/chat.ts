import { concierge } from "./agents";
import { config, usdc } from "./config";
import type { CommandName } from "./commands";
import { Reply, type FileEntry, type Payvoke, type ThreadMessageEvent } from "./payvoke";
import { tools } from "./state";

export type Commands = { byId: Map<string, CommandName>; id: Record<CommandName, string> };

const isDocument = (f: FileEntry) =>
  f.contentType === "application/pdf" ||
  f.contentType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
  f.contentType.startsWith("text/") ||
  f.name.toLowerCase().endsWith(".pdf") ||
  f.name.toLowerCase().endsWith(".docx") ||
  f.name.toLowerCase().endsWith(".txt");

const text = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, 500) : undefined;

const WANTS_JOB = /cv|resume|job|hồ sơ|tìm việc|tuyển dụng|career|apply|work|interview/i;

const intakeForm = {
  name: "ask_form" as const,
  args: {
    title: "Tải lên CV / Hồ sơ xin việc",
    description: "Cung cấp file CV (PDF, DOCX hoặc TXT). Nhập thêm nơi ở để nhận gợi ý việc làm chính xác tại địa phương & các tỉnh lân cận.",
    schema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          format: "file",
          title: "File CV / Resume",
          accept: [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "text/plain",
          ],
          maxBytes: 5 * 1024 * 1024,
        },
        location: {
          type: "string",
          title: "Nơi ở / Khu vực mong muốn (VD: Hà Nội, TP.HCM, Đà Nẵng... - để trống nếu đã có trong CV)",
          maxLength: 200,
        },
        goal: {
          type: "string",
          title: "Mục tiêu công việc hoặc kỳ vọng lương (tùy chọn)",
          maxLength: 500,
        },
      },
      required: ["file"],
    },
    submitLabel: "Tiếp tục",
  },
};

export async function handleMessage(api: Payvoke, commands: Commands, ev: ThreadMessageEvent) {
  const replyId = (suffix: string) => `${ev.messageId}-${suffix}`;

  // 1. Buyer submitted a tool response (intake form or service choice)
  if (ev.toolResult) {
    const pending = await tools.get(ev.toolResult.toolCallId);
    const result = (ev.toolResult.result ?? {}) as Record<string, unknown>;

    // Intake form submitted: ask which service they want
    if (pending?.kind === "intake" && text(result.file)) {
      return askServiceChoice(
        api,
        ev.threadId,
        replyId("choice"),
        text(result.file)!,
        text(result.goal),
        text(result.location),
      );
    }

    // Service choice submitted
    if (pending?.kind === "service_choice") {
      const selected = (result.selected as string[] | undefined)?.[0];
      const command: CommandName = selected === "find_job" ? "find_job" : "analyze_cv";
      return offerCommand(
        api,
        commands,
        ev.threadId,
        replyId("offer"),
        pending.fileId,
        command,
        pending.goal,
        pending.location,
      );
    }
  }

  // 2. Slash commands
  const command = ev.commandId ? commands.byId.get(ev.commandId) : undefined;
  const args = ev.arguments ?? {};
  const fileId = text(args.file);
  const location = text(args.location);
  const goal = text(args.goal);

  if (command === "analyze_cv" && fileId) {
    return offerCommand(api, commands, ev.threadId, replyId("offer"), fileId, "analyze_cv", goal, location);
  }
  if (command === "find_job" && fileId) {
    return offerCommand(api, commands, ev.threadId, replyId("offer"), fileId, "find_job", goal, location);
  }
  if (command && !fileId) {
    const message = await api.sendMessage(ev.threadId, {
      clientRequestId: replyId("intake"),
      tool: intakeForm,
    });
    await tools.put(message.id, { kind: "intake", threadId: ev.threadId });
    return;
  }

  // 3. User sent a message with a CV attached directly
  const doc = ev.files.find(isDocument);
  if (doc) {
    return askServiceChoice(api, ev.threadId, replyId("choice"), doc.fileId, text(ev.content));
  }

  // 4. Regular chat conversation with AI Concierge streaming
  const withForm = WANTS_JOB.test(ev.content);
  const answer = await Reply.open(api, ev.threadId, {
    clientRequestId: replyId("chat"),
    ...(withForm ? { tool: intakeForm } : {}),
  });
  if (withForm) await tools.put(answer.messageId, { kind: "intake", threadId: ev.threadId });
  await chatReply(ev, answer);
}

async function askServiceChoice(
  api: Payvoke,
  threadId: string,
  requestId: string,
  fileId: string,
  goal?: string,
  location?: string,
) {
  const message = await api.sendMessage(threadId, {
    clientRequestId: requestId,
    tool: {
      name: "ask_choice",
      args: {
        prompt: "Bạn muốn Job Finder hỗ trợ những dịch vụ nào cho CV này?",
        options: [
          {
            id: "find_job",
            label: `Tìm việc theo khu vực & Đánh giá (${usdc(config.PRICE_FIND_JOB)} USDC)`,
            description: "Tìm việc làm phù hợp theo nơi ở & các tỉnh lân cận, mức lương thị trường và đánh giá CV.",
          },
          {
            id: "analyze_cv",
            label: `Phân tích & Đánh giá CV toàn diện (${usdc(config.PRICE_ANALYZE_CV)} USDC)`,
            description: "Đọc chi tiết CV, chấm điểm đánh giá điểm mạnh/yếu và gợi ý việc làm khu vực.",
          },
        ],
      },
    },
  });
  await tools.put(message.id, { kind: "service_choice", threadId, fileId, goal, location });
}

async function offerCommand(
  api: Payvoke,
  commands: Commands,
  threadId: string,
  requestId: string,
  fileId: string,
  command: CommandName,
  goal?: string,
  location?: string,
) {
  const commandId = commands.id[command];
  const price = command === "analyze_cv" ? config.PRICE_ANALYZE_CV : config.PRICE_FIND_JOB;
  const summary =
    command === "analyze_cv"
      ? "Đọc & phân tích chi tiết thông tin CV, chấm điểm đánh giá điểm mạnh/yếu, và gợi ý việc làm theo khu vực."
      : "Đọc CV, đánh giá hồ sơ và tìm việc làm đang tuyển dụng phù hợp theo vị trí nơi ở của bạn & các tỉnh lân cận (kèm mức lương thị trường).";

  const details: string[] = [];
  if (location) details.push(`Khu vực: ${location}`);
  if (goal) details.push(`Mục tiêu: ${goal}`);
  const fullSummary = details.length ? `${summary} (${details.join(" | ")})` : summary;

  try {
    await api.createOffer(threadId, {
      clientRequestId: requestId,
      commandId,
      arguments: { file: fileId, ...(location ? { location } : {}), ...(goal ? { goal } : {}) },
      grossAmount: price,
      deliverySeconds: 300,
      validForSeconds: 1800,
      summary: fullSummary.slice(0, 500),
    });
  } catch (error) {
    console.error(`offer failed: ${error instanceof Error ? error.message : error}`);
    await api.sendMessage(threadId, {
      clientRequestId: `${requestId}-error`,
      content: "Xin lỗi, hiện chưa thể tạo offer lúc này. Vui lòng thử lại sau giây lát.",
    });
  }
}

async function chatReply(ev: ThreadMessageEvent, answer: Reply) {
  type Turn = { role: "user"; content: string } | { role: "assistant"; content: string };
  const history: Turn[] = ev.conversation.slice(-10).map((m): Turn => {
    const content = m.content || "(attachment)";
    return m.role === "BUYER" ? { role: "user", content } : { role: "assistant", content };
  });
  if (history.at(-1)?.content !== ev.content) history.push({ role: "user", content: ev.content });

  try {
    const out = await concierge.stream(history, { abortSignal: AbortSignal.timeout(30_000) });
    for await (const delta of out.textStream) await answer.write(delta);
  } catch (error) {
    console.error(`chat model failed: ${error instanceof Error ? error.message : error}`);
  }
  await answer.close(
    "Xin chào! Tôi là Job Finder. Bạn có thể dùng **/find_job** để tìm việc làm theo nơi ở & các tỉnh lân cận kèm mức lương thị trường, hoặc **/analyze_cv** để được đánh giá hồ sơ toàn diện.",
  );
}
