import { expect, test } from "bun:test";
import { createChatHandler } from "../src/chat";
import { PayvokeError } from "../src/payvoke";
import type { PendingIntake } from "../src/state";
import { commands, file, memoryStore, message } from "./fixtures";
import { FakePayvoke } from "./payvoke.fake";

function setup() {
  const api = new FakePayvoke();
  const tools = memoryStore<PendingIntake>();
  let chats = 0;
  const handle = createChatHandler({
    price: "150000",
    tools,
    concierge: async function* () {
      chats++;
      yield "Vui lòng tải CV.";
    },
  });
  return { api, tools, handle, chats: () => chats };
}

test("CV request opens an intake form, submission produces the priced offer", async () => {
  const { api, tools, handle, chats } = setup();
  await handle(api, commands, message({ content: "Tôi muốn review CV" }));
  expect(api.messages[0]!.tool?.name).toBe("ask_form");
  expect(chats()).toBe(1);
  expect(api.offers).toHaveLength(0);
  expect(await tools.get("reply-1")).toMatchObject({ threadId: "thread-1" });
  await handle(
    api,
    commands,
    message({
      messageId: "submitted",
      toolResult: {
        toolCallId: "reply-1",
        result: { file: file.fileId, goal: "Cải thiện phần kinh nghiệm" },
      },
    }),
  );
  expect(api.offers[0]).toMatchObject({
    grossAmount: "150000",
    commandId: "review-command",
    arguments: { file: "cv-file", goal: "Cải thiện phần kinh nghiệm" },
  });
});

test("slash command with no file preserves its goal through intake", async () => {
  const { api, handle } = setup();
  const goal = "x".repeat(500);
  await handle(api, commands, message({ commandId: "review-command", arguments: { goal } }));
  expect(api.messages[0]!.tool?.name).toBe("ask_form");
  const schema = (
    api.messages[0]!.tool!.args as { schema: { properties: { goal: { title: string } } } }
  ).schema;
  expect(schema.properties.goal.title.length).toBeLessThanOrEqual(120);
  await handle(
    api,
    commands,
    message({
      messageId: "submitted",
      toolResult: { toolCallId: "reply-1", result: { file: "cv-file" } },
    }),
  );
  expect(api.offers[0]!.arguments.goal).toBe(goal);
});

test("slash commands and direct attachments create offers without free CV analysis", async () => {
  for (const event of [
    message({ commandId: "review-command", arguments: { file: file.fileId, goal: "Review kỹ" } }),
    message({ files: [file], content: "Review kỹ" }),
  ]) {
    const { api, handle, chats } = setup();
    await handle(api, commands, event);
    expect(api.offers).toHaveLength(1);
    expect(chats()).toBe(0);
    expect(api.reports).toHaveLength(0);
  }
});

test("rejects bad attachments and expired/cross-thread form submissions", async () => {
  const { api, handle, tools } = setup();
  await handle(
    api,
    commands,
    message({ files: [{ ...file, name: "cv.exe", contentType: "application/zip" }] }),
  );
  await handle(api, commands, message({ messageId: "multi", files: [file, file] }));
  await handle(
    api,
    commands,
    message({
      messageId: "expired",
      toolResult: { toolCallId: "expired", result: { file: "cv-file" } },
    }),
  );
  await tools.put("other-thread", { threadId: "other" });
  await handle(
    api,
    commands,
    message({
      messageId: "foreign",
      toolResult: { toolCallId: "other-thread", result: { file: "cv-file" } },
    }),
  );
  expect(api.offers).toHaveLength(0);
  expect(api.messages).toHaveLength(4);
});

test("offer failures are visible and concierge failure has a fixed fallback", async () => {
  const { api, handle } = setup();
  api.offerError = new PayvokeError(422, "PRICE_BELOW_FLOOR");
  await handle(api, commands, message({ files: [file] }));
  expect(api.messages[0]!.content).toContain("Chưa tạo được offer");
  let output = "";
  let done = false;
  api.appendDelta = async (_thread, _message, delta) => {
    output += delta.delta;
    done = delta.done ?? false;
    return { id: "reply" };
  };
  const fallbackHandler = createChatHandler({
    price: "150000",
    tools: memoryStore<PendingIntake>(),
    concierge: async function* () {
      yield* [];
      throw new Error("model unavailable");
    },
  });
  await fallbackHandler(api, commands, message({ content: "Xin chào" }));
  expect(output).toContain("/review_cv");
  expect(done).toBe(true);
});
