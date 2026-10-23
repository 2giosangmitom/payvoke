const origin = import.meta.env.VITE_API_ORIGIN || "http://localhost:3001";

export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${origin}${path}`, {
    method,
    credentials: "include",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
  return data as T;
}
