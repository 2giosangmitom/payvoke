import { call, client, type Body } from "@/src/lib/api/client";

const tokens = client.v1["access-tokens"];

export type AccessToken = Body<typeof tokens.$get>[number];

export const listAccessTokens = () => call(tokens.$get());
// With `autopay`, the vault grant just registered becomes the token's limit.
export const createAccessToken = (
  name: string,
  expiresInDays: number,
  autopay?: { grantId: string; buyer: string; signer: string },
) => call(tokens.$post({ json: { name, expiresInDays, ...(autopay ? { autopay } : {}) } }));
export const revokeAccessToken = (id: string) => call(tokens[":id"].$delete({ param: { id } }));
