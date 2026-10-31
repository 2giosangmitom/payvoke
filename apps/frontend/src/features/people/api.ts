import { ApiError, apiOrigin, call, client, type Body } from "@/src/lib/api/client";

const apps = client.v1.apps;

export type Profile = Body<typeof client.v1.profile.$get>;
export type Developer = Body<(typeof client.v1.developers)[":userId"]["$get"]>;
export type Person = Developer["apps"][number]["owner"];
export type AccountStats = Body<typeof client.v1.stats.$get>;
export type ProviderStats = NonNullable<AccountStats["provider"]>;
export type DayFigure = AccountStats["buyer"]["series"][number];
export type Ratings = Body<(typeof apps)[":appId"]["ratings"]["$get"]>;
export type RatingItem = Ratings["items"][number];

export const getProfile = () => call(client.v1.profile.$get());
export const updateProfile = (json: { displayName?: string | null; bio?: string | null }) =>
  call(client.v1.profile.$patch({ json }));
export const removeProfileImage = () => call(client.v1.profile.image.$delete());

// The image file is the raw body, so this goes around the JSON RPC client.
export async function uploadProfileImage(file: Blob): Promise<Profile> {
  const response = await fetch(`${apiOrigin}/v1/profile/image`, {
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
  return data as Profile;
}

export const getDeveloper = (userId: string) =>
  call(client.v1.developers[":userId"].$get({ param: { userId } }));
export const getStats = () => call(client.v1.stats.$get());

export const getRatings = (appId: string) =>
  call(apps[":appId"].ratings.$get({ param: { appId } }));
export const rateApp = (appId: string, json: { score: number; comment?: string | null }) =>
  call(apps[":appId"].rating.$put({ param: { appId }, json }));
export const unrateApp = (appId: string) =>
  call(apps[":appId"].rating.$delete({ param: { appId } }));
