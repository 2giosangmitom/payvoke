import {
  EventType,
  type RunStartedEvent,
  type RunFinishedEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
} from "@ag-ui/core";
import type { ConversationEvent, ConversationMessage } from "../domain/conversation.js";

export function toAgUiMessages(messages: ConversationMessage[]) {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.parts.map((part) => part.text).join(""),
  }));
}

export function toAgUiEvent(
  event: ConversationEvent,
  threadId: string,
  runId: string,
):
  | RunStartedEvent
  | RunFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent {
  switch (event.kind) {
    case "run-start":
      return { type: EventType.RUN_STARTED, threadId, runId };
    case "text-start":
      return { type: EventType.TEXT_MESSAGE_START, messageId: event.messageId, role: "assistant" };
    case "text-delta":
      return {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: event.messageId,
        delta: event.text,
      };
    case "text-end":
      return { type: EventType.TEXT_MESSAGE_END, messageId: event.messageId };
    case "run-end":
      return { type: EventType.RUN_FINISHED, threadId, runId };
  }
}
