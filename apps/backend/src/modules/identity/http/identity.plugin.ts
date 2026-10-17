import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { ApiErrorSchema, ProfileUpdateSchema, UserViewSchema } from "./identity.schemas.js";
import { principalOf, requireAuth } from "./require-auth.js";
import { httpValue } from "./identity-http.js";

const bearer = [{ bearer: [] }];

export const identityRoutes: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    "/v1/me",
    {
      preHandler: requireAuth,
      schema: {
        security: bearer,
        response: {
          200: UserViewSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      return request.diScope.resolve("accounts").me(principalOf(request));
    },
  );

  fastify.patch(
    "/v1/me",
    {
      preHandler: requireAuth,
      schema: {
        security: bearer,
        body: ProfileUpdateSchema,
        response: {
          200: UserViewSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          403: ApiErrorSchema,
        },
      },
    },
    async (request) => {
      return httpValue(
        await request.diScope.resolve("accounts").updateProfile(principalOf(request), request.body),
      );
    },
  );
};
