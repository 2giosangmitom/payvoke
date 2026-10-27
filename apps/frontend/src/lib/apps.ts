import { api } from "./api";
import type { CommandRevision } from "./paid-chat";

export type Availability = "AVAILABLE" | "UNAVAILABLE" | "SUSPENDED";
export type StoreApp = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  availability: Availability;
  commandCount: number;
  // The most any offer may cost; null when a command has no cap.
  priceCap: string | null;
  updatedAt: string;
};
export type StoreAppDetail = {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  status: string;
  availability: Availability;
  priceCap: string | null;
  canChat: boolean;
  defaultCommandId: string | null;
  commands: { id: string; name: string; description: string; revision: CommandRevision | null }[];
  createdAt: string;
  updatedAt: string;
};
export type StarredApp = {
  id: string;
  name: string;
  description: string | null;
  visibility: string;
  status: string;
  availability: Availability;
  commandCount: number;
  starredAt: string;
};
export type ProviderApp = {
  id: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  status: string;
  payoutAddress: string;
  defaultCommandId: string | null;
  lastHeartbeatAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  availability: Availability;
};
export type ProviderCommand = {
  id: string;
  name: string;
  description: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revision: CommandRevision | null;
};
export type ProviderAppDetail = ProviderApp & { commands: ProviderCommand[] };
export type ProviderKey = {
  id: string;
  prefix: string;
  scopes: string[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
export const listStoreApps = (options: { q?: string; cursor?: string; saved?: boolean } = {}) => {
  const params = new URLSearchParams();
  if (options.q?.trim()) params.set("q", options.q.trim());
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.saved) params.set("saved", "1");
  const query = params.toString();
  return api<{ items: StoreApp[]; nextCursor: string | null }>(
    `/v1/apps${query ? `?${query}` : ""}`,
  );
};
export const getStoreApp = (id: string) =>
  api<StoreAppDetail>(`/v1/apps/${encodeURIComponent(id)}`);
export const starApp = (id: string) =>
  api<{ starred: boolean }>(`/v1/apps/${encodeURIComponent(id)}/star`, "PUT");
export const unstarApp = (id: string) =>
  api<{ starred: boolean }>(`/v1/apps/${encodeURIComponent(id)}/star`, "DELETE");
export const getStars = () => api<StarredApp[]>("/v1/stars");

export const listProviderApps = () => api<ProviderApp[]>("/v1/provider/apps");
export const createProviderApp = (body: {
  name: string;
  description?: string;
  payoutAddress: string;
  visibility: "PUBLIC" | "PRIVATE";
  clientRequestId?: string;
}) =>
  api<ProviderApp>("/v1/provider/apps", "POST", {
    ...body,
    clientRequestId: body.clientRequestId ?? crypto.randomUUID(),
  });
export const getProviderApp = (id: string) =>
  api<ProviderAppDetail>(`/v1/provider/apps/${encodeURIComponent(id)}`);
export const updateProviderApp = (
  id: string,
  body: {
    name?: string;
    description?: string | null;
    visibility?: "PUBLIC" | "PRIVATE";
    payoutAddress?: string;
  },
) => api<ProviderApp>(`/v1/provider/apps/${encodeURIComponent(id)}`, "PATCH", body);
export const archiveProviderApp = (id: string) =>
  api<{ archived: boolean }>(`/v1/provider/apps/${encodeURIComponent(id)}/archive`, "POST");
export const suspendProviderApp = (id: string) =>
  api<{ status: string }>(`/v1/provider/apps/${encodeURIComponent(id)}/suspensions`, "POST");
export const activateProviderApp = (id: string) =>
  api<{ status: string }>(`/v1/provider/apps/${encodeURIComponent(id)}/activations`, "POST");

export const listProviderKeys = (id: string) =>
  api<ProviderKey[]>(`/v1/provider/apps/${encodeURIComponent(id)}/keys`);
export const createProviderKey = (
  id: string,
  scopes = [
    "products:write",
    "events:read",
    "events:ack",
    "reports:write",
    "files:write",
    "messages:write",
    "offers:write",
  ],
) =>
  api<{ id: string; scopes: string[]; expiresAt: string; secret: string }>(
    `/v1/provider/apps/${encodeURIComponent(id)}/keys`,
    "POST",
    { scopes, expiresAt: new Date(Date.now() + 90 * 86400000).toISOString() },
  );
export const revokeProviderKey = (id: string, keyId: string) =>
  api<{ revoked: boolean }>(
    `/v1/provider/apps/${encodeURIComponent(id)}/keys/${encodeURIComponent(keyId)}/revocations`,
    "POST",
  );

export function formatUsdc(atomic: string | null | undefined, maximumFractionDigits = 4) {
  if (!atomic) return "—";
  return `${(Number(atomic) / 1_000_000).toLocaleString(undefined, {
    maximumFractionDigits,
  })} USDC`;
}
// Bots price each request with an offer; a command may cap that price.
export function formatCommandPrice(revision: CommandRevision | null | undefined) {
  if (!revision) return "—";
  return revision.maxGrossAmount
    ? `Priced by offer · up to ${formatUsdc(revision.maxGrossAmount)}`
    : "Priced by offer";
}
