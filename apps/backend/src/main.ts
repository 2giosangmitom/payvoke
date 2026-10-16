import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule, type Environment } from "./modules/app.module.js";

async function main() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  app.enableShutdownHooks();
  const config = app.get<ConfigService<Environment>>(ConfigService);
  await app.listen(config.getOrThrow<number>("PORT"));
}

main();
