-- Provider forms and run questions become built-in tool calls.

-- Pre-sale: a provider message opens a tool ({name, args}) instead of a form.
ALTER TABLE "thread_messages" RENAME COLUMN "form" TO "tool";
UPDATE "thread_messages"
SET "tool" = jsonb_build_object('name', 'ask_form', 'args', "tool")
WHERE "tool" IS NOT NULL;

-- Runs: questions become tool calls, answers become tool results.
ALTER TABLE "invocation_answers" DROP CONSTRAINT "invocation_answers_invocationId_questionId_fkey";

ALTER TABLE "invocation_questions" RENAME TO "invocation_tool_calls";
ALTER TABLE "invocation_tool_calls" RENAME CONSTRAINT "invocation_questions_pkey" TO "invocation_tool_calls_pkey";
ALTER TABLE "invocation_tool_calls" RENAME CONSTRAINT "invocation_questions_invocationId_fkey" TO "invocation_tool_calls_invocationId_fkey";
ALTER INDEX "invocation_questions_invocationId_status_idx" RENAME TO "invocation_tool_calls_invocationId_status_idx";
ALTER INDEX "invocation_questions_invocationId_questionId_key" RENAME TO "invocation_tool_calls_invocationId_toolCallId_key";
ALTER TABLE "invocation_tool_calls" RENAME COLUMN "questionId" TO "toolCallId";
ALTER TABLE "invocation_tool_calls" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'ask_form';
ALTER TABLE "invocation_tool_calls" ADD COLUMN "args" JSONB;
UPDATE "invocation_tool_calls"
SET "args" = jsonb_build_object('title', left("prompt", 120), 'schema', "inputSchema");
ALTER TABLE "invocation_tool_calls" ALTER COLUMN "args" SET NOT NULL;
ALTER TABLE "invocation_tool_calls" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "invocation_tool_calls" DROP COLUMN "prompt";
ALTER TABLE "invocation_tool_calls" DROP COLUMN "inputSchema";
ALTER TABLE "invocation_tool_calls" DROP COLUMN "chatTextParameter";

ALTER TABLE "invocation_answers" RENAME TO "invocation_tool_results";
ALTER TABLE "invocation_tool_results" RENAME CONSTRAINT "invocation_answers_pkey" TO "invocation_tool_results_pkey";
ALTER TABLE "invocation_tool_results" RENAME CONSTRAINT "invocation_answers_invocationId_fkey" TO "invocation_tool_results_invocationId_fkey";
ALTER INDEX "invocation_answers_buyerId_createdAt_idx" RENAME TO "invocation_tool_results_buyerId_createdAt_idx";
ALTER INDEX "invocation_answers_invocationId_clientRequestId_key" RENAME TO "invocation_tool_results_invocationId_clientRequestId_key";
ALTER INDEX "invocation_answers_invocationId_questionId_key" RENAME TO "invocation_tool_results_invocationId_toolCallId_key";
ALTER TABLE "invocation_tool_results" RENAME COLUMN "questionId" TO "toolCallId";
ALTER TABLE "invocation_tool_results" RENAME COLUMN "arguments" TO "result";

ALTER TABLE "invocation_tool_results" ADD CONSTRAINT "invocation_tool_results_invocationId_toolCallId_fkey" FOREIGN KEY ("invocationId", "toolCallId") REFERENCES "invocation_tool_calls"("invocationId", "toolCallId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audio player metadata declared by the uploader.
ALTER TABLE "file_assets" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "file_assets" ADD COLUMN "peaks" JSONB;
