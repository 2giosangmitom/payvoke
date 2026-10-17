import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { Environment } from "./config/environment.js";
import { AppModule } from "./modules/app.module.js";

async function main() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Environment>>(ConfigService);
  app.enableCors({
    origin: new URL(config.getOrThrow<string>("AUTH_ORIGIN")).origin,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
  await app.listen(config.getOrThrow<number>("PORT"));
}

main();
