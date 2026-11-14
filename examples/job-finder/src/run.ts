import { jobMatcher } from "./agents";
import type { Commands } from "./chat";
import type { InvocationReadyEvent, Payvoke, RevisionEvent, ToolResultEvent } from "./payvoke";
import { PayvokeError, Run } from "./payvoke";
import type { CommandName } from "./commands";
import { jobs, type Job } from "./state";
import { extractText } from "unpdf";
import { formatQuickApplySection } from "./links";

function extractTargetRole(cvText: string, goal?: string): string {
  if (goal && goal.trim().length > 2) return goal.trim();
  const matches = cvText.match(
    /(?:frontend|backend|fullstack|software|developer|engineer|kỹ sư|lập trình viên|data engineer|tester|qa|qc|product manager|business analyst|ui\/ux|designer|kế toán|marketing|sales|chuyên viên)[^\n,.]*/i,
  );
  if (matches?.[0]) return matches[0].trim();
  return "Chuyên viên / Kỹ sư";
}

// Helper to claim a run and acknowledge it
async function claim(api: Payvoke, invocationId: string, eventId: string, runId: string) {
  const ack = await api.ackRun(invocationId, eventId);
  if (ack.status !== "ACKED") {
    console.warn(`run ${runId}: already ${ack.status}, skipping`);
    return null;
  }
  return new Run(api, invocationId, ack.runId ?? runId);
}

async function guard(run: Run, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof PayvokeError && (error.status === 409 || error.code.includes("CONFLICT"))) {
      console.warn(`run ${run.runId}: conflict or already finalized, skipping error reporting: ${error.message}`);
      return;
    }
    console.error(`run ${run.runId} failed: ${error instanceof Error ? error.message : error}`);
    try {
      await run.startText(`failed-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
      await run.text(`Đã xảy ra sự cố trong quá trình xử lý yêu cầu. Bạn sẽ được hoàn tiền tự động.`);
      await run.finish({ type: "failed", data: { reason: "internal_error" } });
    } catch {}
  }
}

// Detect PDF by magic bytes (%PDF-)
function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function extractCvText(bytes: Uint8Array, fileName: string): Promise<string> {
  // 1. PDF: use unpdf to properly extract text from compressed streams
  if (isPdf(bytes) || fileName.toLowerCase().endsWith(".pdf")) {
    try {
      const { text, totalPages } = await extractText(bytes, { mergePages: true });
      const rawText = typeof text === "string" ? text : Array.isArray(text) ? (text as string[]).join("\n\n") : String(text ?? "");
      const cleaned = rawText
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      console.log(`PDF parsed: ${totalPages} pages, ${cleaned.length} chars`);
      return cleaned.slice(0, 15_000);
    } catch (error) {
      console.error(`PDF parse failed: ${error instanceof Error ? error.message : error}`);
      return "";
    }
  }

  // 2. Plain text / DOCX fallback: decode as UTF-8
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const cleaned = decoded
    .replace(/[^\x20-\x7E\r\n\t\u00A0-\u024F\u1EA0-\u1EF9]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
  return cleaned.slice(0, 15_000);
}

export async function handleReady(
  api: Payvoke,
  commands: Commands,
  ev: InvocationReadyEvent & { id: string },
) {
  const commandId = ev.input.commandId;
  const args = ev.input.arguments;
  const commandName = commands.byId.get(commandId) as CommandName | undefined;
  const fileId = typeof args.file === "string" ? args.file : undefined;
  const location = typeof args.location === "string" ? args.location : undefined;

  if (!commandName || !fileId) {
    console.warn(`Invocation missing command or fileId: command=${commandName}, fileId=${fileId}`);
    return;
  }

  const job: Job = {
    command: commandName,
    threadId: ev.threadId,
    fileId,
    fileName: ev.input.context.files.find((f) => f.fileId === fileId)?.name ?? "CV",
    location,
    goal: typeof args.goal === "string" ? args.goal : undefined,
    depth: "quick",
    metric: null,
    artifactVersion: 0,
  };

  await jobs.put(ev.invocationId, job);
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;

  await guard(run, async () => {
    await run.report({ type: "started", data: { command: commandName } });
    await run.progress("download", `Đang đọc nội dung ${job.fileName}...`);

    const bytes = await api.download(ev.invocationId, fileId);
    const cvText = await extractCvText(bytes, job.fileName);

    if (!cvText || cvText.length < 20) {
      await run.progress("download", `Không thể đọc nội dung ${job.fileName}`, "failed");
      await run.startText(`error-${run.runId}`);
      await run.text(`Không thể đọc được nội dung văn bản từ tệp CV đã tải lên. Vui lòng đảm bảo tệp ở định dạng PDF, DOCX hoặc TXT hợp lệ.`);
      await run.finish({ type: "failed", data: { reason: "unreadable_file" } });
      return;
    }

    await run.progress("download", `Đã đọc nội dung ${job.fileName}`, "done");

    await run.progress("ai_analysis", `Đang đọc CV, đánh giá hồ sơ và tìm kiếm việc làm theo khu vực...`);
    await run.startText(`result-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));

    let fullReport = "";
    let pending = "";
    let flushedAt = Date.now();

    const userLocation = job.location
      ? `Địa điểm mong muốn / Nơi ở ứng viên cung cấp: ${job.location}`
      : `Địa điểm: Tự động trích xuất từ địa chỉ, học vấn, số điện thoại hoặc công ty trong CV. Nếu không ghi rõ, hãy phân tích dựa trên các trung tâm việc làm chính (Hà Nội, TP.HCM, Đà Nẵng...) và cơ hội Remote / Hybrid.`;

    const userGoal = job.goal
      ? `Mục tiêu nghề nghiệp / Trọng tâm bổ sung: ${job.goal}`
      : `Mục tiêu: Đánh giá toàn diện hồ sơ và tìm kiếm các cơ hội việc làm đang tuyển dụng phù hợp nhất.`;

    const prompt = `Nội dung trích xuất từ CV của ứng viên:\n"""\n${cvText}\n"""\n\nThông tin ngữ cảnh:\n- ${userLocation}\n- ${userGoal}\n- Tên tệp: ${job.fileName}\n\nHãy đọc và đánh giá hồ sơ CV, sau đó khảo sát và đề xuất các vị trí việc làm đang có nhu cầu tuyển dụng thực tế phù hợp nhất theo vị trí nơi ứng viên ở và các tỉnh thành lân cận (kèm mức lương thị trường, yêu cầu cốt lõi và kênh tìm việc) theo đúng cấu trúc báo cáo.`;

    const agent = jobMatcher;

    try {
      const out = await agent.stream([{ role: "user", content: prompt }], {
        abortSignal: AbortSignal.timeout(120_000),
      });
      for await (const delta of out.textStream) {
        fullReport += delta;
        pending += delta;
        if (pending.length > 300 || Date.now() - flushedAt > 400) {
          await run.text(pending);
          pending = "";
          flushedAt = Date.now();
        }
      }
      if (pending) {
        await run.text(pending);
      }
    } catch (error) {
      console.warn(`agent streaming error: ${error instanceof Error ? error.message : error}`);
    }

    if (!fullReport.trim()) {
      fullReport = `Hiện chưa thể tạo bản báo cáo hoàn chỉnh. Vui lòng thử lại sau giây lát.`;
      await run.text(fullReport);
    } else {
      const targetRole = extractTargetRole(cvText, job.goal);
      const quickApplyLinks = formatQuickApplySection(targetRole, job.location);
      fullReport += quickApplyLinks;
      await run.text(quickApplyLinks);
    }

    await run.endText();
    job.artifactVersion += 1;
    await jobs.put(ev.invocationId, job);

    await run.progress("ai_analysis", "Đã đánh giá hồ sơ & tìm kiếm việc làm", "done");

    await run.finish({
      type: "result",
      data: {
        artifactVersion: job.artifactVersion,
        output: fullReport,
        files: [],
      },
    });
  });
}

export async function handleToolResult(api: Payvoke, ev: ToolResultEvent & { id: string }) {
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;
  await guard(run, async () => {
    await run.report({ type: "started", data: { resumedFrom: ev.toolCallId } });
    await run.finish({
      type: "result",
      data: { artifactVersion: 1, output: "Tool result processed.", files: [] },
    });
  });
}

export async function handleRevision(api: Payvoke, ev: RevisionEvent & { id: string }) {
  const run = await claim(api, ev.invocationId, ev.id, ev.runId);
  if (!run) return;
  await guard(run, async () => {
    const job = await jobs.get(ev.invocationId);
    if (!job) throw new Error("Job state not found for revision");

    await run.report({ type: "started", data: { revision: true } });
    await run.progress("revision", "Refining report based on your feedback...");

    const bytes = await api.download(ev.invocationId, job.fileId);
    const cvText = await extractCvText(bytes, job.fileName);
    const agent = jobMatcher;

    const userLocation = job.location
      ? `Địa điểm mong muốn / Nơi ở: ${job.location}`
      : `Địa điểm: Nhận diện từ CV hoặc mục tiêu ban đầu.`;

    const prompt = `Nội dung trích xuất từ CV của ứng viên:\n"""\n${cvText}\n"""\n\nThông tin ngữ cảnh:\n- ${userLocation}\n- Mục tiêu ban đầu: ${job.goal ?? "Không có"}\n- Tên tệp: ${job.fileName}\n\nYêu cầu điều chỉnh từ người mua (Revision Request):\n${ev.reason || "Vui lòng tinh chỉnh, cập nhật chi tiết hơn về đánh giá CV hoặc các vị trí việc làm theo khu vực."}\n\nHãy viết lại bản báo cáo hoàn chỉnh dựa trên yêu cầu này theo đúng định dạng Markdown chuyên nghiệp.`;

    await run.startText(`revision-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
    let fullReport = "";
    let pending = "";
    let flushedAt = Date.now();

    try {
      const out = await agent.stream([{ role: "user", content: prompt }], {
        abortSignal: AbortSignal.timeout(120_000),
      });
      for await (const delta of out.textStream) {
        fullReport += delta;
        pending += delta;
        if (pending.length > 300 || Date.now() - flushedAt > 400) {
          await run.text(pending);
          pending = "";
          flushedAt = Date.now();
        }
      }
      if (pending) {
        await run.text(pending);
      }
    } catch (error) {
      console.warn(`revision streaming error: ${error instanceof Error ? error.message : error}`);
    }

    if (!fullReport.trim()) {
      fullReport = `Hiện chưa thể tạo bản báo cáo tinh chỉnh hoàn chỉnh. Vui lòng thử lại sau giây lát.`;
      await run.text(fullReport);
    } else if (!fullReport.includes("Danh Sách Link Tuyển Dụng Trực Tiếp")) {
      const targetRole = extractTargetRole(cvText, job.goal);
      const quickApplyLinks = formatQuickApplySection(targetRole, job.location);
      fullReport += quickApplyLinks;
      await run.text(quickApplyLinks);
    }

    await run.endText();

    job.artifactVersion += 1;
    await jobs.put(ev.invocationId, job);

    await run.progress("revision", "Đã tinh chỉnh báo cáo theo phản hồi", "done");

    await run.finish({
      type: "result",
      data: {
        artifactVersion: job.artifactVersion,
        output: fullReport,
        files: [],
      },
    });
  });
}
