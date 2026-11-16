// Generates the builder API reference from the routes: an OpenAPI 3.1 spec
// for the web app's /docs page, plus llms.txt and llms-full.txt for agents.
//
//   bun --filter api docs          write the files
//   bun --filter api docs --check  fail if they are stale
import { createMarkdownFromOpenApi } from "@scalar/openapi-to-markdown";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { builderSpec, type Json, type Operation } from "../src/builder-spec";
import { BUILDER_TAGS } from "../src/http/openapi";

const root = join(import.meta.dir, "..");
const frontend = join(root, "../frontend");

const slug = (tag: string) => tag.toLowerCase();

// The llmstxt.org index: what the API is and where each part lives.
function llmsIndex(spec: Json & { paths: Record<string, Record<string, Operation>> }) {
  const info = spec.info as { title: string };
  const lines = [
    `# ${info.title}`,
    "",
    "> HTTP API for builders who connect their AI agents to Payvoke: register slash commands, read the event feed, chat with buyers, make priced offers in USDC on Avalanche, and deliver paid work.",
    "",
    'Authenticate with the agent\'s app key: `Authorization: Bearer pvk_…`. Every failure answers `{ "error": "CODE" }`.',
    "",
    "Base URL: `https://payvoke.up.railway.app`. Every path below is relative to it.",
    "",
    "## Docs",
    "",
    "- [Full reference](/llms-full.txt): every endpoint with its request, responses and error codes, in Markdown",
    "- [OpenAPI spec](/openapi.json): the same reference as OpenAPI 3.1 JSON",
    "- [Overview](/docs): authentication, scopes, the job lifecycle, retries and errors",
    "- [x402 with escrow](/docs/x402): hire an agent's instant command over x402 (`payvoke-escrow` scheme), the catalog, status codes and the TypeScript SDK",
  ];
  for (const tag of BUILDER_TAGS) {
    lines.push("", `## ${tag}`, "");
    for (const [path, item] of Object.entries(spec.paths))
      for (const [method, operation] of Object.entries(item))
        if (operation.tags?.includes(tag))
          lines.push(
            `- [${operation.summary}](/docs/${slug(tag)}#${operation.operationId}): \`${method.toUpperCase()} ${path}\``,
          );
  }
  return `${lines.join("\n")}\n`;
}

const spec = await builderSpec();
const json = `${JSON.stringify(spec, null, 2)}\n`;
const outputs: Record<string, string> = {
  [join(frontend, "src/features/docs/openapi.json")]: json,
  [join(frontend, "public/openapi.json")]: json,
  [join(frontend, "public/llms.txt")]: llmsIndex(spec),
  [join(frontend, "public/llms-full.txt")]: `${(await createMarkdownFromOpenApi(json)).trim()}\n`,
};

if (process.argv.includes("--check")) {
  const stale: string[] = [];
  for (const [file, content] of Object.entries(outputs)) {
    const current = await readFile(file, "utf8").catch(() => null);
    if (current !== content) stale.push(file.replace(`${join(root, "../..")}/`, ""));
  }
  if (stale.length) {
    console.error(`Stale builder docs, run \`bun --filter api docs\`:\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
} else {
  for (const [file, content] of Object.entries(outputs)) await writeFile(file, content);
}
