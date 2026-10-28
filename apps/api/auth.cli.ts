import "dotenv/config";
import { loadConfig } from "./src/config";
import { createDatabase } from "#core/db";
import { createAuth } from "./src/modules/auth/auth";

const config = loadConfig();
export const auth = createAuth(config, createDatabase(config.DATABASE_URL));
