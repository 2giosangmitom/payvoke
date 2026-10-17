import { describe, expect, it } from "vitest";
import {
  developmentReply,
  turnEvents,
  validateTurn,
} from "../src/modules/workspace/domain/conversation.js";
import { toAgUiEvent } from "../src/modules/workspace/http/ag-ui.js";

describe("conversation event model", () => {
  it("preserves original Unicode text and stable message IDs across deltas", () => {
    const text = "a".repeat(31) + "🌏" + "研究".repeat(35);
    const events = turnEvents("message", text);
    expect(
      events
        .filter((event) => event.kind === "text-delta")
        .map((event) => event.text)
        .join(""),
    ).toBe(text);
    expect(
      events
        .filter((event) => "messageId" in event)
        .every((event) => event.messageId === "message"),
    ).toBe(true);
    expect(events.map((event) => toAgUiEvent(event, "thread", "run").type)).toEqual([
      "RUN_STARTED",
      "TEXT_MESSAGE_START",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_CONTENT",
      "TEXT_MESSAGE_END",
      "RUN_FINISHED",
    ]);
  });
  it("bounds admitted user input and does not silently trim stored text", () => {
    const input = { runId: "run", messageId: "message", text: "  original text  " };
    expect(validateTurn(input).unwrap()).toEqual(input);
    expect(validateTurn({ ...input, text: " " }).isErr()).toBe(true);
    expect(validateTurn({ ...input, runId: "../escape" }).isErr()).toBe(true);
    expect(validateTurn({ ...input, text: "x".repeat(4001) }).isErr()).toBe(true);
    expect(developmentReply()).toContain("no AI model or provider has been called");
  });
});
