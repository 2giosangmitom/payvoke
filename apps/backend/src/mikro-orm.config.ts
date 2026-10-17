import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { appConfigModule, type Environment } from "./config/environment.js";
import { createMikroOrmOptions } from "./database/mikro-orm.options.js";

// Load the same validated Nest configuration without booting the application or database.
async function loadMikroOrmConfig() {
  const app = await NestFactory.createApplicationContext(await appConfigModule, { logger: false });
  try {
    return createMikroOrmOptions(app.get<ConfigService<Environment>>(ConfigService));
  } finally {
    await app.close();
  }
}

export default loadMikroOrmConfig();
