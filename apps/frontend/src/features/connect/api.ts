import { call, client, type Body } from "@/src/lib/api/client";

const tokens = client.v1["access-tokens"];

export type AccessToken = Body<typeof tokens.$get>[number];

export const listAccessTokens = () => call(tokens.$get());
// The key comes with `signer`, the address its vault grant must name.
export const createAccessToken = (name: string, expiresInDays: number) =>
  call(tokens.$post({ json: { name, expiresInDays } }));
// Makes a grant registered for the key's signer its autopay limit.
export const linkAccessTokenGrant = (id: string, grant: { grantId: string; buyer: string }) =>
  call(tokens[":id"].grant.$put({ param: { id }, json: grant }));
export const extendAccessToken = (id: string, expiresInDays: number) =>
  call(tokens[":id"].$patch({ param: { id }, json: { expiresInDays } }));
export const revokeAccessToken = (id: string) => call(tokens[":id"].$delete({ param: { id } }));
