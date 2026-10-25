import type { FastifyInstance } from "fastify";
import { openuiCatalog } from "./validator";

// Provider LLMs need the exact component signatures the gateway accepts.
export async function openuiRoutes(app: FastifyInstance) {
  const catalog = openuiCatalog();
  app.get("/v1/openui/catalog", async () => catalog);
}
