import { call, client, type Body } from "@/src/lib/api/client";

export type ActivityItem = Body<typeof client.v1.invocations.$get>["items"][number];

export const getActivity = (cursor?: string) =>
  call(client.v1.invocations.$get({ query: cursor ? { cursor } : {} }));
