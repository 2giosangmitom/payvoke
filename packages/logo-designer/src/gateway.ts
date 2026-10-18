import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { ProviderClient, type SlashCommand } from "@agentne/provider-sdk";
import { generateLogo } from "./agent.js";

if (process.env.ALLOW_MODEL_EXPENSE !== "true" || !process.env.OPENAI_API_KEY)
  throw new Error(
    "Set OPENAI_API_KEY and ALLOW_MODEL_EXPENSE=true. Gateway invocations may incur real provider model expense.",
  );
const applicationId = process.env.AGENTNE_APPLICATION_ID;
const apiKey = process.env.AGENTNE_API_KEY;
if (!applicationId || !apiKey) throw new Error("Set AGENTNE_APPLICATION_ID and AGENTNE_API_KEY.");
const journalPath = process.env.AGENTNE_JOURNAL ?? "data/gateway.sqlite";
mkdirSync(dirname(journalPath), { recursive: true, mode: 0o700 });
const client = new ProviderClient({
  apiKey,
  applicationId,
  baseUrl: process.env.AGENTNE_URL ?? "http://localhost:8000",
  journalPath,
  onError: (error) => console.error(error.message),
});
const commands: SlashCommand[] = [
  {
    name: "logo",
    description: "Design one SVG logo symbol from a brand brief",
    inputSchema: {
      type: "object",
      properties: { brief: { type: "string", maxLength: 8000 } },
      required: ["brief"],
      additionalProperties: false,
    },
  },
];
// Registration is an explicit deployment step, never a reconnect side effect.
let revisionId = process.env.AGENTNE_COMMAND_REVISION;
if (process.env.REGISTER_COMMANDS === "true") {
  const revision = await client.registerCommands(commands);
  revisionId = revision.id;
  console.log(
    `Registered command revision ${revisionId}. Registration does not publish or enable catalog execution.`,
  );
}
if (!revisionId) {
  await client.close();
  throw new Error("Set AGENTNE_COMMAND_REVISION or explicitly REGISTER_COMMANDS=true.");
}
client.onCommand("logo", revisionId, async ({ input, signal, progress }) => {
  if (!input.brief?.trim() || input.brief.length > 8000)
    throw new Error("A non-empty brand brief is required.");
  await progress("Designing one logo symbol…");
  const result = await generateLogo(
    input.brief,
    AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  );
  return result.text;
});
await client.connect();
console.log(
  "Logo Designer connected to the development Gateway. Model calls cost the provider money.",
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void client.close();
  });
