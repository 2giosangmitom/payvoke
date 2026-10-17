import "dotenv/config";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createProvider } from "./server.js";
import { generateLogo } from "./agent.js";

if (!process.env.OPENAI_API_KEY)
  throw new Error("Set OPENAI_API_KEY. Real model calls incur provider expense.");
const databasePath = process.env.PROVIDER_DATABASE ?? "data/logo-designs.sqlite";
mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
const app = createProvider({
  token: process.env.PROVIDER_TOKEN ?? "",
  databasePath,
  generate: generateLogo,
});
await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 8200) });
console.log("Logo Designer listening. One SVG logo per brief; execution costs the provider money.");
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    void app.close();
  });
