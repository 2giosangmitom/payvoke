import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import type { Config } from "./config";
import { makeQuickReviewGenerator, quickReviewerInstructions, quickReviewSchema } from "./quick";
import { makeReviewGenerator, reviewerInstructions, reviewDraftSchema } from "./review";

export type ChatTurn = { role: "user"; content: string } | { role: "assistant"; content: string };
export type Concierge = (turns: ChatTurn[]) => AsyncIterable<string>;

export function createAgents(config: Config) {
  const model = [config.MODEL, ...config.FALLBACK_MODELS].map((id) => ({
    model: id,
    maxRetries: config.MODEL_RETRIES,
  }));
  const defaultOptions = { providerOptions: { openrouter: { reasoning: { enabled: false } } } };
  const conciergeAgent = new Agent({
    id: "cv-concierge",
    name: "CV Reviewer concierge",
    model,
    defaultOptions,
    instructions: `Bạn là CV Reviewer trên Payvoke. Trả lời bằng tiếng Việt trong tối đa 4 câu ngắn.
Chat miễn phí giải thích dịch vụ: /review_cv review CV bằng tiếng Việt và tạo CV PDF đã cải thiện,
giữ ngôn ngữ bản gốc. Nhận PDF có văn bản, DOCX và TXT, tối đa 5 MB; không nhận PDF scan.
Hướng dẫn tải CV hoặc dùng /review_cv. Không review trong chat miễn phí, không báo giá bằng lời
(giá nằm trong offer), không tìm việc hay đối chiếu JD. Không hứa chắc vượt ATS hoặc được tuyển.`,
  });
  const reviewer = new Agent({
    id: "cv-reviewer",
    name: "CV Reviewer",
    model,
    defaultOptions,
    instructions: reviewerInstructions,
  });
  const quickReviewer = new Agent({
    id: "cv-quick-reviewer",
    name: "CV quick reviewer",
    model,
    defaultOptions,
    instructions: quickReviewerInstructions,
  });
  // Disable Mastra's default logging, which can include complete provider payloads.
  new Mastra({ agents: { conciergeAgent, reviewer, quickReviewer }, logger: false });
  const concierge: Concierge = async function* (turns) {
    const output = await conciergeAgent.stream(turns, { abortSignal: AbortSignal.timeout(30_000) });
    yield* output.textStream;
  };
  const generateReview = makeReviewGenerator(async (prompt, abortSignal) => {
    const output = await reviewer.generate(prompt, {
      structuredOutput: { schema: reviewDraftSchema, jsonPromptInjection: true },
      abortSignal,
    });
    if (output.error) throw output.error;
    return output.object;
  });
  const generateQuickReview = makeQuickReviewGenerator(async (prompt, abortSignal) => {
    const output = await quickReviewer.generate(prompt, {
      structuredOutput: { schema: quickReviewSchema, jsonPromptInjection: true },
      abortSignal,
    });
    if (output.error) throw output.error;
    return output.object;
  });
  return { concierge, generateReview, generateQuickReview };
}
