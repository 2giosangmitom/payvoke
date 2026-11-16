// The SDK's HTTP layer: one origin, a small cookie jar for the Better Auth
// session (no browser to keep it), and the Origin header the API requires on
// cookie-authenticated writes.

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

// Cookies for a single API origin. Paths and domains are not tracked: the
// SDK talks to one API and every Payvoke cookie is `Path=/`.
export class CookieJar {
  private readonly cookies = new Map<string, { value: string; expires: number | null }>();

  // Stores the cookies of one response; `Max-Age=0` or a past `Expires` deletes.
  store(headers: Headers) {
    const lines =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : (headers.get("set-cookie")?.split(/,(?=\s*[^;=\s]+=)/) ?? []);
    for (const line of lines) {
      const [pair, ...attributes] = line.split(";").map((part) => part.trim());
      const split = pair.indexOf("=");
      if (split <= 0) continue;
      const name = pair.slice(0, split);
      const value = pair.slice(split + 1);
      let expires: number | null = null;
      for (const attribute of attributes) {
        const [key, ...rest] = attribute.split("=");
        const raw = rest.join("=");
        if (key.toLowerCase() === "max-age") expires = Date.now() + Number(raw) * 1000;
        else if (key.toLowerCase() === "expires" && expires === null) {
          const at = Date.parse(raw);
          if (!Number.isNaN(at)) expires = at;
        }
      }
      if (!value || (expires !== null && expires <= Date.now())) this.cookies.delete(name);
      else this.cookies.set(name, { value, expires });
    }
  }

  header(): string | null {
    const now = Date.now();
    const pairs: string[] = [];
    for (const [name, cookie] of this.cookies) {
      if (cookie.expires !== null && cookie.expires <= now) this.cookies.delete(name);
      else pairs.push(`${name}=${cookie.value}`);
    }
    return pairs.length ? pairs.join("; ") : null;
  }

  has(predicate: (name: string) => boolean) {
    this.header();
    return [...this.cookies.keys()].some(predicate);
  }

  clear() {
    this.cookies.clear();
  }
}

export type SessionOptions = {
  baseUrl: string;
  webOrigin: string;
  accessToken?: string;
  fetch: FetchLike;
};

// A fetch that authenticates every request to the API origin: the buyer
// access token if there is one, else the session cookie plus Origin.
export function sessionFetch(options: SessionOptions, jar: CookieJar): FetchLike {
  const api = new URL(options.baseUrl).origin;
  return async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.origin !== api) return options.fetch(input, init);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers).forEach((value, name) => headers.set(name, value));
    if (options.accessToken) headers.set("authorization", `Bearer ${options.accessToken}`);
    else {
      const cookie = jar.header();
      if (cookie) headers.set("cookie", cookie);
      headers.set("origin", options.webOrigin);
    }
    const response = await options.fetch(input, { ...init, headers });
    jar.store(response.headers);
    return response;
  };
}

// Reads a body once: JSON when it is JSON, else text.
export async function readBody(response: Response): Promise<unknown> {
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return response.json().catch(() => null);
  return response.text().catch(() => null);
}
