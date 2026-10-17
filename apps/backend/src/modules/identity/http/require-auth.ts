import type { FastifyReply, FastifyRequest } from "fastify";
import { httpFailure, httpValue } from "./identity-http.js";
import type { Principal } from "../domain/identity.types.js";

/**
 * Route preHandler that authenticates a Supabase bearer token, ensures the
 * application profile exists and attaches the principal to the request.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.header("Cache-Control", "no-store");
  const authorization = request.headers.authorization;
  const match =
    authorization && authorization.length < 16384 ? /^Bearer (\S+)$/i.exec(authorization) : null;
  if (match === null || match[1] === undefined) {
    httpFailure("INVALID_SESSION", "A bearer token is required.");
  }
  const principal = httpValue(await request.diScope.resolve("authService").authenticate(match[1]));
  httpValue(await request.diScope.resolve("accounts").ensureProfile(principal));
  request.principal = principal;
}

/** Reads the principal a preceding `requireAuth` preHandler attached. */
export function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) httpFailure("INVALID_SESSION", "A valid session is required.");
  return request.principal;
}
