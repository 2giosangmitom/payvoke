import createClient from "openapi-fetch";
import type { paths } from "./schema";
import { getSupabase } from "./supabase";

export const apiHost = import.meta.env.VITE_API_HOST ?? "http://localhost:8000";

/** Obtain the current (possibly refreshed) session for every request, not once at mount. */
export async function authenticatedFetch(input: string | URL | Request, init?: RequestInit) {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Your session expired. Please sign in again.");
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}

export const api = createClient<paths>({
  baseUrl: apiHost,
  fetch: authenticatedFetch,
});

/** Wallet-free discovery must not require or forward a marketplace session. */
export const publicApi = createClient<paths>({ baseUrl: apiHost });
