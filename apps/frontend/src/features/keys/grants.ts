import { call, client, type Body } from "@/src/lib/api/client";

const grants = client.v1.grants;
const operations = client.v1["grant-operations"];

export type Grant = Body<typeof grants.$get>[number];
export type GrantOperation = Body<typeof operations.$post>;
export type GrantOperationRequest = Parameters<typeof operations.$post>[0]["json"];

export const listGrants = () => call(grants.$get());
export const recordGrant = (json: {
  grantId: string;
  buyer: string;
  signer: string;
  kind: "agent" | "browser";
  name: string;
}) => call(grants.$post({ json }));
export const forgetGrant = (id: string) => call(grants[":id"].$delete({ param: { id } }));

// A grant change the buyer signed, for Payvoke's relayer to put on chain.
export const submitGrantOperation = (json: GrantOperationRequest) =>
  call(operations.$post({ json }));
export const getGrantOperation = (id: string) => call(operations[":id"].$get({ param: { id } }));
