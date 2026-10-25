import type { Cradle } from "@fastify/awilix";
import type { FastifyReply, FastifyRequest } from "fastify";

export class AuthController {
  private readonly authService: Cradle["authService"];

  constructor({ authService }: Cradle) {
    this.authService = authService;
  }

  proxy = async (request: FastifyRequest, reply: FastifyReply) => {
    const response = await this.authService.handle(
      request.url,
      request.method,
      request.headers,
      request.body,
    );
    reply.code(response.status);
    response.headers.forEach((value, name) => {
      if (name !== "set-cookie" && name !== "content-length") reply.header(name, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) reply.header("set-cookie", cookies);
    if (!response.ok) {
      // SIWE can wrap adapter exceptions in a 401 with an `error` detail.
      // Forward only a public code, never arbitrary library/DB exception data.
      const failure = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: unknown;
      };
      if (response.status >= 500 || failure.error) {
        request.log.error("Authentication request failed");
        return reply.code(500).send({ code: "INTERNAL_ERROR", message: "Authentication failed" });
      }
      return { code: failure.code ?? "AUTHENTICATION_FAILED", message: "Authentication failed" };
    }
    return reply.send(await response.text());
  };

  me = async (request: FastifyRequest) => ({
    buyer: { id: request.account!.id, address: request.account!.walletAddress },
    roles: [],
    scopes: [],
  });
}
