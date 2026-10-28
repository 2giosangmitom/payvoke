// In-process requests against a Hono app, answered in the shape the tests
// assert on: status, text body, parsed JSON, lowercase headers and cookies.
type Requestable = {
  request(input: string, init?: RequestInit): Response | Promise<Response>;
  ready?(): Promise<void>;
};

export type InjectOptions = {
  method?: string;
  url: string;
  headers?: Record<string, string | undefined>;
  // Objects are sent as JSON; strings and bytes as they are.
  payload?: unknown;
};

export type Cookie = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  expires?: Date;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
};

function parseCookie(header: string): Cookie {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  const split = pair.indexOf("=");
  const cookie: Cookie = {
    name: pair.slice(0, split),
    value: decodeURIComponent(pair.slice(split + 1)),
  };
  for (const attribute of attributes) {
    const [key, ...rest] = attribute.split("=");
    const value = rest.join("=");
    switch (key.toLowerCase()) {
      case "path":
        cookie.path = value;
        break;
      case "domain":
        cookie.domain = value;
        break;
      case "expires":
        cookie.expires = new Date(value);
        break;
      case "max-age":
        cookie.maxAge = Number(value);
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "samesite":
        cookie.sameSite = value;
        break;
    }
  }
  return cookie;
}

export async function inject(app: Requestable, options: InjectOptions | string) {
  const {
    method = "GET",
    url,
    headers = {},
    payload,
  } = typeof options === "string" ? { url: options } : options;
  await app.ready?.();
  const sent = new Headers();
  for (const [name, value] of Object.entries(headers))
    if (value !== undefined) sent.set(name, value);
  let body: BodyInit | undefined;
  if (typeof payload === "string" || payload instanceof Uint8Array) body = payload as BodyInit;
  else if (payload !== undefined) {
    body = JSON.stringify(payload);
    if (!sent.has("content-type")) sent.set("content-type", "application/json");
  }
  const response = await app.request(url, { method, headers: sent, body });
  const text = await response.text();
  const cookies = response.headers.getSetCookie();
  const responseHeaders: Record<string, string | string[]> = {};
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") responseHeaders[name] = value;
  });
  if (cookies.length) responseHeaders["set-cookie"] = cookies.length === 1 ? cookies[0] : cookies;
  return {
    statusCode: response.status,
    headers: responseHeaders,
    body: text,
    payload: text,
    json: <T = any>(): T => JSON.parse(text),
    cookies: cookies.map(parseCookie),
  };
}
