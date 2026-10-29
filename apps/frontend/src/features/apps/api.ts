import { ApiError, apiOrigin, call, client, type Body } from "@/src/lib/api/client";

const apps = client.v1.apps;
const provider = client.v1.provider.apps;

export type Availability = StoreApp["availability"];
export type StoreApp = Body<typeof apps.$get>["items"][number];
export type StoreAppDetail = Body<(typeof apps)[":appId"]["$get"]>;
export type StarredApp = Body<typeof client.v1.stars.$get>[number];
export type ProviderApp = Body<typeof provider.$get>[number];
export type ProviderAppDetail = Body<(typeof provider)[":appId"]["$get"]>;
export type ProviderCommand = ProviderAppDetail["commands"][number];
export type ProviderKey = Body<(typeof provider)[":appId"]["keys"]["$get"]>[number];
export type Visibility = "PUBLIC" | "PRIVATE";

// --- Store ---

export const listStoreApps = (options: { q?: string; cursor?: string; saved?: boolean } = {}) =>
  call(
    apps.$get({
      query: {
        ...(options.q?.trim() ? { q: options.q.trim() } : {}),
        ...(options.cursor ? { cursor: options.cursor } : {}),
        ...(options.saved ? { saved: "1" } : {}),
      },
    }),
  );
export const getStoreApp = (appId: string) => call(apps[":appId"].$get({ param: { appId } }));
export const starApp = (appId: string) => call(apps[":appId"].star.$put({ param: { appId } }));
export const unstarApp = (appId: string) => call(apps[":appId"].star.$delete({ param: { appId } }));
export const getStars = () => call(client.v1.stars.$get());

// --- Studio ---

export const listProviderApps = () => call(provider.$get());
export const createProviderApp = (body: {
  name: string;
  description?: string;
  visibility: Visibility;
  clientRequestId?: string;
}) =>
  call(
    provider.$post({
      json: { ...body, clientRequestId: body.clientRequestId ?? crypto.randomUUID() },
    }),
  );
export const getProviderApp = (appId: string) =>
  call(provider[":appId"].$get({ param: { appId } }));
export const updateProviderApp = (
  appId: string,
  json: {
    name?: string;
    description?: string | null;
    visibility?: Visibility;
  },
) => call(provider[":appId"].$patch({ param: { appId }, json }));

// The image file is the raw body, so this goes around the JSON RPC client.
export async function uploadAppImage(appId: string, file: File): Promise<ProviderApp> {
  const response = await fetch(`${apiOrigin}/v1/provider/apps/${appId}/image`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      (data as { error?: string }).error || `HTTP ${response.status}`,
    );
  return data as ProviderApp;
}
export const removeAppImage = (appId: string) =>
  call(provider[":appId"].image.$delete({ param: { appId } }));
export const appImageSrc = (path: string | null | undefined) =>
  path ? `${apiOrigin}${path}` : undefined;
export const archiveProviderApp = (appId: string) =>
  call(provider[":appId"].archive.$post({ param: { appId } }));
export const suspendProviderApp = (appId: string) =>
  call(provider[":appId"].suspensions.$post({ param: { appId } }));
export const activateProviderApp = (appId: string) =>
  call(provider[":appId"].activations.$post({ param: { appId } }));

export const listProviderKeys = (appId: string) =>
  call(provider[":appId"].keys.$get({ param: { appId } }));
// The secret is in this response only: never cache or persist it.
export const createProviderKey = (appId: string) =>
  call(
    provider[":appId"].keys.$post({
      param: { appId },
      json: { expiresAt: new Date(Date.now() + 90 * 86400000).toISOString() },
    }),
  );
export const revokeProviderKey = (appId: string, keyId: string) =>
  call(provider[":appId"].keys[":keyId"].revocations.$post({ param: { appId, keyId } }));
