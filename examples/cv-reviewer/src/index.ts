import { createAgents } from "./agents";
import { createChatHandler, type Commands } from "./chat";
import { commandDefinitions, type CommandName } from "./commands";
import { configSchema } from "./config";
import { Payvoke, type FeedEvent } from "./payvoke";
import { createRunHandlers } from "./run";
import { diskStore, type Job, type PendingIntake } from "./state";

const parsed = configSchema.safeParse(Bun.env);
if (!parsed.success) {
  // Zod errors can include input values. Report keys only, never secrets.
  console.error(
    `Invalid configuration: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join(".")))].join(", ")}`,
  );
  process.exit(1);
}
const config = parsed.data;
const api = new Payvoke(config.PAYVOKE_API_URL, config.PAYVOKE_APP_ID, config.PAYVOKE_KEY);
const jobs = diskStore<Job>(config.STATE_DIR, "jobs");
const tools = diskStore<PendingIntake>(config.STATE_DIR, "tools");
const { concierge, generateReview, generateQuickReview } = createAgents(config);
const handleMessage = createChatHandler({ price: config.PRICE_REVIEW_CV, tools, concierge });
const { handleReady, handleRevision, handleToolResult } = createRunHandlers({
  jobs,
  generateReview,
  generateQuickReview,
});
const registered = await api.overwriteCommands(commandDefinitions(config.PRICE_REVIEW_CV));
const commands: Commands = {
  byId: new Map(registered.map((command) => [command.id, command.name as CommandName])),
  id: Object.fromEntries(registered.map((command) => [command.name, command.id])) as Record<
    CommandName,
    string
  >,
};
await Promise.all([jobs.cleanup(), tools.cleanup()]);
const cleanup = setInterval(() => {
  void Promise.all([jobs.cleanup(), tools.cleanup()]).catch(() =>
    console.warn("state cleanup failed"),
  );
}, 60_000);
cleanup.unref();

const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());
const inFlight = new Set<string>();
const queues = new Map<string, Promise<void>>();
const failures = new Map<string, number>();

async function handle(event: FeedEvent) {
  switch (event.type) {
    case "thread.message": {
      try {
        await handleMessage(api, commands, event);
      } catch {
        const count = (failures.get(event.id) ?? 0) + 1;
        failures.set(event.id, count);
        if (count < 3) throw new Error("message handling failed");
        console.warn("message abandoned after three attempts");
      }
      await api.ackMessage(event.threadId, event.messageId);
      failures.delete(event.id);
      return;
    }
    case "invocation.ready":
      return handleReady(api, commands, event);
    case "invocation.revision_requested":
      return handleRevision(api, event);
    case "invocation.tool_result":
      return handleToolResult(api, event);
  }
}

function dispatch(event: FeedEvent) {
  if (inFlight.has(event.id)) return;
  inFlight.add(event.id);
  const key =
    event.type === "thread.message" ? `thread:${event.threadId}` : `job:${event.invocationId}`;
  const next = (queues.get(key) ?? Promise.resolve())
    .then(() => handle(event))
    .catch(() => console.warn(`event handling failed: ${event.type}`))
    .finally(() => inFlight.delete(event.id));
  queues.set(key, next);
  void next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
}

console.log("CV Reviewer listening for Payvoke events (/review_cv, /quick_review)");
try {
  for await (const event of api.events(controller.signal)) dispatch(event);
} finally {
  clearInterval(cleanup);
  await Promise.allSettled(queues.values());
}
