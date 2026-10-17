import {
  TypeBoxValidatorCompiler,
  registerAjvFormats,
  type TypeBoxTypeProvider,
} from "@fastify/type-provider-typebox";
import cors from "@fastify/cors";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyPluginAsync,
  type FastifyServerOptions,
} from "fastify";
import type { MikroORM } from "@mikro-orm/postgresql";
import type { Environment } from "./config/environment.js";
import { loadEnvironment } from "./config/environment.js";
import { createOrm } from "./database/orm.js";
import fp from "fastify-plugin";
import diPlugin from "./plugins/awilix.js";
import swaggerPlugin from "./plugins/swagger.js";
import { identityRoutes } from "./modules/identity/http/identity.plugin.js";
import { ApiHttpError } from "./modules/identity/http/identity-http.js";
import { workspaceRoutes } from "./modules/workspace/http/workspace.plugin.js";
import { publishingRoutes } from "./modules/publishing/http/publishing.plugin.js";

export interface CreateAppOptions {
  env: Environment;
  orm: MikroORM;
  logger?: FastifyServerOptions["logger"];
}

const application: FastifyPluginAsync<Partial<CreateAppOptions>> = async (app, options) => {
  const env = options.env ?? loadEnvironment();
  const orm = options.orm ?? (await createOrm(env));
  registerAjvFormats();

  app.setValidatorCompiler(TypeBoxValidatorCompiler);

  // Register the error contract before plugins so it propagates into their contexts.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiHttpError) {
      return reply.status(error.status).send(error.body);
    }
    if (error.validation) {
      return reply.status(400).send({ code: "INVALID_REQUEST", message: "Invalid request." });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return reply.status(500).send({ code: "INTERNAL_ERROR", message: "Internal server error." });
    }
    return reply.status(status).send({ code: `HTTP_${status}`, message: error.message });
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ code: "NOT_FOUND", message: "Route not found." }),
  );

  await app.register(cors, {
    origin: new URL(env.AUTH_ORIGIN).origin,
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["X-Stream-Reset"],
  });
  await app.register(diPlugin, { env, orm });
  await app.register(swaggerPlugin);
  await app.register(identityRoutes);
  await app.register(workspaceRoutes);
  await app.register(publishingRoutes);

  app.addHook("onClose", async () => {
    if (await orm.isConnected()) await orm.close();
  });
};

// Fastify CLI loads this plugin for Swagger generation without starting a listener.
const applicationPlugin = fp(application, { name: "application" });
export default applicationPlugin;

export async function createApp(options: CreateAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true }).withTypeProvider<TypeBoxTypeProvider>();
  await app.register(applicationPlugin, options);
  return app;
}
