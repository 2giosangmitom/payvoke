import type { INestiaConfig } from "@nestia/sdk";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./src/modules/app.module.js";

export const NESTIA_CONFIG: INestiaConfig = {
  input: () => NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter()),
  swagger: {
    output: "dist/swagger.json",
  },
  output: "../../packages/api/src",
};

export default NESTIA_CONFIG;
