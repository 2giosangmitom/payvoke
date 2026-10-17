import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      info: { title: "AI Agent Marketplace API", version: "1.0.0" },
      components: {
        securitySchemes: {
          bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  });

  fastify.get("/docs-json", { schema: { hide: true } }, async () => fastify.swagger());
  await fastify.register(swaggerUi, { routePrefix: "/docs" });
};

export default fp(swaggerPlugin, { name: "swagger" });
