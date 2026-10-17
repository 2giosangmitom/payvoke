import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { WorkspacePage } from "~/components/workspace/workspace-page";

export const Route = createFileRoute("/workspace")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    workspace: typeof search.workspace === "string" ? search.workspace : undefined,
    conversation: typeof search.conversation === "string" ? search.conversation : undefined,
    offset:
      Number.isInteger(Number(search.offset)) &&
      Number(search.offset) >= 0 &&
      Number(search.offset) <= 10000
        ? Number(search.offset)
        : 0,
    conversationOffset:
      Number.isInteger(Number(search.conversationOffset)) &&
      Number(search.conversationOffset) >= 0 &&
      Number(search.conversationOffset) <= 10000
        ? Number(search.conversationOffset)
        : 0,
  }),
  component: WorkspacePage,
});
