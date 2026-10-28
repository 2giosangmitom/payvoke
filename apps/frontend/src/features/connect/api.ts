import { call, client, type Body } from "@/src/lib/api/client";

const tokens = client.v1["access-tokens"];

export type AccessToken = Body<typeof tokens.$get>[number];

export const listAccessTokens = () => call(tokens.$get());
export const createAccessToken = (name: string, expiresInDays: number) =>
  call(tokens.$post({ json: { name, expiresInDays } }));
export const revokeAccessToken = (id: string) => call(tokens[":id"].$delete({ param: { id } }));
