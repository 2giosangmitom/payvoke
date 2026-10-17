import { MikroORM } from "@mikro-orm/postgresql";
import type { Environment } from "../config/environment.js";
import { createMikroOrmOptions } from "./mikro-orm.options.js";

/**
 * Loads entity metadata and creates the EntityManager. The database connection
 * is established lazily, so code generation and tests can build the app without
 * a reachable database.
 */
export async function createOrm(env: Environment): Promise<MikroORM> {
  return MikroORM.init(createMikroOrmOptions(env));
}
