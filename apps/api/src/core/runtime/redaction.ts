import { DEFAULT_REDACT_FIELDS } from "@logtape/redaction";

// Log properties whose values never reach a sink, at any depth: LogTape's
// defaults (secrets, tokens, keys, auth, signatures, addresses) plus payment
// headers, cookies, bodies, connection URLs, configuration and signed payloads.
export const redactedLogFields = [
  ...DEFAULT_REDACT_FIELDS,
  /cookie/i,
  /^payment-(signature|required|response)$/i,
  /^body$/i,
  /^(DATABASE|RPC|REDIS)_URL$/,
  /^config$/,
  /^signed(Transaction|Url)$/,
];

// Error class and code only: messages can embed RPC URLs, SQL or signed payloads.
export function errorTag(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? `${error.name}:${code}`
    : error.name;
}
