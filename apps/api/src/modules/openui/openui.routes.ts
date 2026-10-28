import { Hono } from "hono";
import type { AppEnv } from "../../http/context";
import { openuiCatalog } from "./validator";

const catalog = openuiCatalog();

// Provider LLMs need the exact component signatures the gateway accepts.
export const openuiRoutes = new Hono<AppEnv>().get("/v1/openui/catalog", (c) => c.json(catalog));
