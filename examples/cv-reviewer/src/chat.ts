import type { Concierge, ChatTurn } from "./agents";
import { DELIVERY_SECONDS, type CommandName } from "./commands";
import { ACCEPT, CvError, MAX_BYTES, validateFile } from "./document";
import { Payvoke, PayvokeError, Reply, type ThreadMessageEvent } from "./payvoke";
import type { PendingIntake, Store } from "./state";

export type Commands = { byId: Map<string, CommandName>; id: Record<CommandName, string> };
const WANTS_REVIEW = /cv|resume|résumé|hồ sơ|review|đánh giá|xin việc/i;
const str = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;
const FALLBACK =
  "Tôi hỗ trợ **/review_cv**: review CV bằng tiếng Việt và tạo CV PDF đã cải thiện. Bạn hãy tải CV dạng PDF có văn bản, DOCX hoặc TXT, tối đa 5 MB.";

export function intakeForm(goal?: string) {
  return {
    name: "ask_form" as const,
    args: {
      title: "Review và cải thiện CV",
      description:
        "Nhận báo cáo bằng tiếng Việt và CV PDF mới giữ ngôn ngữ bản gốc. Không hỗ trợ PDF scan hoặc có mật khẩu.",
      schema: {
        type: "object",
        properties: {
          file: {
            type: "string",
            format: "file",
            title: "CV (PDF, DOCX hoặc TXT)",
            accept: ACCEPT,
            maxBytes: MAX_BYTES,
          },
          goal: {
            type: "string",
            title: goal
              ? `Trọng tâm review (đang chọn: ${goal.slice(0, 80)}${goal.length > 80 ? "…" : ""})`
              : "Trọng tâm review (tùy chọn)",
            maxLength: 500,
          },
        },
        required: ["file"],
      },
      submitLabel: "Xem offer",
    },
  };
}

export function createChatHandler(options: {
  price: string;
  tools: Store<PendingIntake>;
  concierge: Concierge;
}) {
  return async function handleMessage(api: Payvoke, commands: Commands, event: ThreadMessageEvent) {
    const request = (suffix: string) => `${event.messageId}-${suffix}`;
    const message = (content: string, suffix = "notice") =>
      api.sendMessage(event.threadId, { clientRequestId: request(suffix), content });
    async function form(goal?: string) {
      const sent = await api.sendMessage(event.threadId, {
        clientRequestId: request("intake"),
        tool: intakeForm(goal),
      });
      await options.tools.put(sent.id, { threadId: event.threadId, goal });
    }
    async function offer(file: string, goal?: string) {
      if (goal && goal.length > 500)
        return message("Trọng tâm review tối đa 500 ký tự. Vui lòng nhập ngắn hơn.");
      try {
        await api.createOffer(event.threadId, {
          clientRequestId: request("offer"),
          commandId: commands.id.review_cv,
          arguments: { file, ...(goal ? { goal } : {}) },
          grossAmount: options.price,
          deliverySeconds: DELIVERY_SECONDS,
          validForSeconds: 1800,
          summary:
            "Review CV bằng tiếng Việt và tạo CV PDF đã cải thiện, giữ ngôn ngữ gốc. Bao gồm một lần chỉnh sửa.",
        });
      } catch (error) {
        // A retry with different arguments is a real conflict, not success.
        const code = error instanceof PayvokeError ? error.code : "OFFER_FAILED";
        console.warn(`offer rejected: ${code}`);
        await message(
          "Chưa tạo được offer. Vui lòng thử lại; nếu lỗi tiếp diễn, chủ agent cần kiểm tra cấu hình giá và dịch vụ.",
          "offer-error",
        );
      }
    }

    if (event.toolResult) {
      const pending = await options.tools.get(event.toolResult.toolCallId);
      const value = event.toolResult.result;
      if (!pending || pending.threadId !== event.threadId)
        return message("Form đã hết hạn. Vui lòng dùng /review_cv để gửi lại CV.");
      if (!value || typeof value !== "object" || Array.isArray(value)) return form(pending.goal);
      const result = value as Record<string, unknown>;
      const file = str(result.file);
      if (!file) return form(pending.goal);
      return offer(file, str(result.goal) ?? pending.goal);
    }

    const command = event.commandId ? commands.byId.get(event.commandId) : undefined;
    if (command === "review_cv") {
      const args = event.arguments ?? {};
      const file = str(args.file),
        goal = str(args.goal);
      return file ? offer(file, goal) : form(goal);
    }
    if (event.files.length) {
      if (event.files.length !== 1)
        return message("Mỗi lượt review nhận một CV. Vui lòng gửi một tệp duy nhất.");
      const file = event.files[0]!;
      try {
        validateFile(file);
      } catch (error) {
        if (error instanceof CvError) return message(error.message);
        throw error;
      }
      return offer(file.fileId, str(event.content)?.slice(0, 500));
    }

    const withForm = WANTS_REVIEW.test(event.content);
    const reply = await Reply.open(api, event.threadId, {
      clientRequestId: request("chat"),
      ...(withForm ? { tool: intakeForm() } : {}),
    });
    if (withForm) await options.tools.put(reply.messageId, { threadId: event.threadId });
    const turns: ChatTurn[] = event.conversation.slice(-10).map((turn) => ({
      role: turn.role === "BUYER" ? "user" : "assistant",
      content: (turn.content || "(tệp đính kèm)").slice(0, 4000),
    }));
    if (turns.at(-1)?.role !== "user" || turns.at(-1)?.content !== event.content) {
      turns.push({ role: "user", content: event.content.slice(0, 4000) });
    }
    try {
      for await (const delta of options.concierge(turns)) await reply.write(delta);
    } catch {
      console.warn("concierge unavailable");
    }
    await reply.close(FALLBACK);
  };
}
