import type { INestiaConfig } from "@nestia/sdk";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./src/modules/app.module.js";

export const NESTIA_CONFIG: INestiaConfig = {
  input: () =>
    NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false }),
  swagger: {
    output: "dist/swagger.json",
    security: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
  },
  output: "../../packages/api/src",
};

export default NESTIA_CONFIG;
