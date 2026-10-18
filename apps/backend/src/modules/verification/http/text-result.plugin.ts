import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import { Type } from "typebox";
import { ApiErrorSchema } from "../../identity/http/identity.schemas.js";
import { principalOf, requireAuth } from "../../identity/http/require-auth.js";
import type { TextResult } from "../domain/text-result.js";

const Params = Type.Object({
  applicationId: Type.String({ format: "uuid" }),
  invocationId: Type.String({ format: "uuid" }),
});
const View = Type.Object({
  id: Type.String({ format: "uuid" }),
  applicationId: Type.String({ format: "uuid" }),
  revisionId: Type.String({ format: "uuid" }),
  listingVersionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  terminalDigest: Type.String(),
  digest: Type.String(),
  text: Type.String(),
  profile: Type.Literal("text-v1"),
  check: Type.Literal("format-valid"),
  deliveryEnabled: Type.Literal(false),
  createdAt: Type.String(),
});
function view(result: TextResult) {
  return {
    id: result.id,
    applicationId: result.applicationId,
    revisionId: result.revisionId,
    listingVersionId: result.listingVersionId,
    terminalDigest: result.terminalDigest,
    digest: result.digest,
    text: result.text,
    profile: "text-v1" as const,
    check: "format-valid" as const,
    deliveryEnabled: false as const,
    createdAt: result.createdAt.toISOString(),
  };
}
const options = {
  preHandler: requireAuth,
  schema: {
    security: [{ bearer: [] }],
    params: Params,
    response: {
      200: View,
      400: ApiErrorSchema,
      401: ApiErrorSchema,
      404: ApiErrorSchema,
      409: ApiErrorSchema,
    },
  },
};
export const textResultRoutes: FastifyPluginAsyncTypebox = async (app) => {
  const path =
    "/v1/provider/applications/:applicationId/dev-invocations/:invocationId/verified-result";
  app.post(path, options, async (req) =>
    view(
      await req.diScope
        .resolve("textResultService")
        .verify(principalOf(req).accountId, req.params.applicationId, req.params.invocationId),
    ),
  );
  app.get(path, options, async (req) =>
    view(
      await req.diScope
        .resolve("textResultService")
        .get(principalOf(req).accountId, req.params.applicationId, req.params.invocationId),
    ),
  );
};
