import fastify from "fastify";

const app = fastify({
  logger: { enabled: true },
});

export default app;
