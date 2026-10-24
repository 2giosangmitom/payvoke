export const apiOrigin = import.meta.env.VITE_API_ORIGIN || "http://localhost:3001";

export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "include",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${apiOrigin}${path}`, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
  return data as T;
}
