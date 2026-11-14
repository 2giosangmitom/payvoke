import type { Commands } from "./chat";
import { REVIEW_SECONDS } from "./commands";
import { CvError, extractCv, sourceBlocks, validateFile } from "./document";
import {
  Payvoke,
  PayvokeError,
  Run,
  type InvocationReadyEvent,
  type RevisionEvent,
  type ToolResultEvent,
} from "./payvoke";
import { renderPdf } from "./pdf";
import { reviewMarkdown, validateReview, type ReviewGenerator } from "./review";
import type { Job, Store } from "./state";

export function createRunHandlers(options: {
  jobs: Store<Job>;
  generateReview: ReviewGenerator;
  render?: typeof renderPdf;
}) {
  async function claim(api: Payvoke, event: { id: string; invocationId: string; runId: string }) {
    const ack = await api.ackRun(event.invocationId, event.id);
    return ack.status === "ACKED"
      ? new Run(api, event.invocationId, ack.runId ?? event.runId)
      : null;
  }

  async function guard(run: Run, work: () => Promise<void>) {
    try {
      await work();
    } catch (error) {
      // A finalized/claimed run cannot accept another terminal report.
      if (
        error instanceof PayvokeError &&
        ["STALE_RUN", "RUN_NOT_RUNNING", "RUN_NOT_ACKED"].includes(error.code)
      )
        return;
      const reason = error instanceof CvError ? error.code : "processing_failed";
      console.warn(`run failed: ${reason}`);
      const text =
        error instanceof CvError
          ? error.message
          : "Không hoàn tất được báo cáo và CV PDF. Yêu cầu sẽ được báo thất bại để hoàn tiền tự động.";
      await run.startText(`failed-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
      await run.text(text);
      await run.finish({ type: "failed", data: { reason } });
    }
  }

  async function execute(run: Run, job: Job, feedback?: string) {
    await run.progress("read", "Đang đọc CV...");
    validateFile(job.file);
    const bytes = await run.api.download(run.invocationId, job.file.fileId);
    const blocks = sourceBlocks(await extractCv(bytes, job.file));
    await run.progress("read", "Đã đọc CV", "done");
    await run.progress("review", "Đang review và cải thiện nội dung CV...");
    const review = validateReview(
      await options.generateReview({ blocks, goal: job.goal, feedback }),
      blocks,
    );
    await run.progress("review", "Đã review và kiểm tra nội dung CV", "done");
    await run.progress("pdf", "Đang tạo CV PDF...");
    const pdf = await (options.render ?? renderPdf)(review.cv);
    await run.progress("pdf", "Đã tạo CV PDF", "done");
    const version = job.artifactVersion + 1;
    await run.progress("upload", "Đang tải CV PDF lên Payvoke...");
    const fileId = await run.api.upload(
      run.invocationId,
      `cv-improved-v${version}.pdf`,
      "application/pdf",
      pdf.bytes,
    );
    await run.progress("upload", "CV PDF đã sẵn sàng", "done");
    const output = reviewMarkdown(review, blocks);
    await run.startText(`review-${run.runId}`.slice(0, 100).replace(/[^\w-]/g, "_"));
    // Stream only validated output; a partial model response is never a deliverable.
    for (let offset = 0; offset < output.length; offset += 3000)
      await run.text(output.slice(offset, offset + 3000));
    await run.endText();
    await options.jobs.put(
      run.invocationId,
      { ...job, artifactVersion: version },
      (REVIEW_SECONDS + 300) * 1000,
    );
    await run.finish({
      type: "result",
      data: { artifactVersion: version, output, files: [{ fileId }] },
    });
  }

  return {
    async handleReady(
      api: Payvoke,
      commands: Commands,
      event: InvocationReadyEvent & { id: string },
    ) {
      const run = await claim(api, event);
      if (!run) return;
      await guard(run, async () => {
        await run.report({ type: "started", data: { command: "review_cv" } });
        const args = event.input.arguments;
        const file = event.input.context.files.find((file) => file.fileId === args.file);
        if (commands.byId.get(event.input.commandId) !== "review_cv" || !file) {
          throw new CvError("invalid_input", "Yêu cầu không có lệnh review CV hoặc tệp CV hợp lệ.");
        }
        if (args.goal !== undefined && (typeof args.goal !== "string" || args.goal.length > 500)) {
          throw new CvError("invalid_goal", "Trọng tâm review phải là văn bản tối đa 500 ký tự.");
        }
        const job: Job = { file, goal: args.goal as string | undefined, artifactVersion: 0 };
        // Claim first: redelivery must not overwrite revision/version state.
        await options.jobs.put(event.invocationId, job);
        await execute(run, job);
      });
    },
    async handleRevision(api: Payvoke, event: RevisionEvent & { id: string }) {
      const run = await claim(api, event);
      if (!run) return;
      await guard(run, async () => {
        await run.report({ type: "started", data: { revision: true } });
        const job = await options.jobs.get(event.invocationId);
        if (!job || job.artifactVersion !== 1) {
          throw new CvError(
            "revision_unavailable",
            "Không còn dữ liệu hoặc lượt chỉnh sửa cho yêu cầu này.",
          );
        }
        await execute(run, job, event.reason);
      });
    },
    async handleToolResult(api: Payvoke, event: ToolResultEvent & { id: string }) {
      // This service never pauses paid work for a tool call.
      const run = await claim(api, event);
      if (!run) return;
      await guard(run, async () => {
        await run.report({ type: "started" });
        throw new CvError(
          "unexpected_tool_result",
          "Yêu cầu tiếp tục không hợp lệ cho dịch vụ review CV.",
        );
      });
    },
  };
}
