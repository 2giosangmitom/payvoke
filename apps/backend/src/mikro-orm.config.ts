import { loadEnvironment } from "./config/environment.js";
import { createMikroOrmOptions } from "./database/mikro-orm.options.js";

// Entry point for the MikroORM CLI (`pnpm --filter backend db ...`).
// Run against compiled output so entities and migrations resolve from `dist`.
export default createMikroOrmOptions(loadEnvironment());
