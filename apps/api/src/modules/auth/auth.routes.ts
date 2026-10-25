import type { FastifyInstance } from "fastify";

export async function authRoutes(app: FastifyInstance) {
  const { authController } = app.diContainer.cradle;

  app.route({
    method: ["GET", "POST"],
    url: "/v1/auth/*",
    bodyLimit: 8192,
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    handler: authController.proxy,
  });

  app.get("/v1/me", { preHandler: app.requireAccount }, authController.me);
}
