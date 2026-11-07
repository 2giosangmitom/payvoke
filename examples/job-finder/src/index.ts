import { handleMessage, type Commands } from "./chat";
import { commandDefinitions, type CommandName } from "./commands";
import { config } from "./config";
import { Payvoke, type FeedEvent } from "./payvoke";
import { handleReady, handleToolResult, handleRevision } from "./run";

const api = new Payvoke(config.PAYVOKE_API_URL, config.PAYVOKE_APP_ID, config.PAYVOKE_KEY);

// Register commands
const registered = await api.overwriteCommands(commandDefinitions);
const commands: Commands = {
  byId: new Map(registered.map((c) => [c.id, c.name as CommandName])),
  id: Object.fromEntries(registered.map((c) => [c.name, c.id])) as Record<CommandName, string>,
};
console.log(`commands: ${registered.map((c) => `/${c.name}`).join(", ")}`);

// Event loop similar to csv-analyst
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => controller.abort());

const inFlight = new Set<string>();
const queues = new Map<string, Promise<void>>();
const failures = new Map<string, number>();

function dispatch(event: FeedEvent) {
  if (inFlight.has(event.id)) return;
  inFlight.add(event.id);
  const key = event.type === "thread.message" ? event.threadId : event.invocationId;
  const next = (queues.get(key) ?? Promise.resolve())
    .then(() => handle(event))
    .catch((error) => console.error(`${event.type} ${event.id}: ${error instanceof Error ? error.message : error}`))
    .finally(() => inFlight.delete(event.id));
  queues.set(key, next);
  next.finally(() => queues.get(key) === next && queues.delete(key));
}

async function handle(event: FeedEvent) {
  console.log(`event ${event.type} ${event.id}`);
  switch (event.type) {
    case "thread.message":
      try {
        await handleMessage(api, commands, event);
      } catch (error) {
        const count = (failures.get(event.id) ?? 0) + 1;
        failures.set(event.id, count);
        if (count < 3) throw error;
        console.error(`giving up on message ${event.messageId}: ${error}`);
      }
      failures.delete(event.id);
      await api.ackMessage(event.threadId, event.messageId);
      return;
    case "invocation.ready":
      return handleReady(api, commands, event);
    case "invocation.tool_result":
      return handleToolResult(api, event);
    case "invocation.revision_requested":
      return handleRevision(api, event);
  }
}

console.log("listening for events");
for await (const event of api.events(controller.signal)) dispatch(event);
await Promise.allSettled(queues.values());
