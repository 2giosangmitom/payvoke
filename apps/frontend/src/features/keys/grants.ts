import { call, client, type Body } from "@/src/lib/api/client";

const grants = client.v1.grants;

export type Grant = Body<typeof grants.$get>[number];

export const listGrants = () => call(grants.$get());
export const recordGrant = (json: {
  grantId: string;
  buyer: string;
  signer: string;
  kind: "agent" | "browser";
  name: string;
}) => call(grants.$post({ json }));
export const forgetGrant = (id: string) => call(grants[":id"].$delete({ param: { id } }));
