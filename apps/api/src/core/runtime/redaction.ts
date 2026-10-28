export const logRedaction = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    'req.headers["payment-signature"]',
    'req.headers["payment-required"]',
    'req.headers["payment-response"]',
    'res.headers["set-cookie"]',
    "req.body",
    "res.body",
    "DATABASE_URL",
    "RPC_URL",
    "BETTER_AUTH_SECRET",
    "FACILITATOR_TOKEN",
    "RELAYER_PRIVATE_KEY",
    "config",
    "token",
    "signature",
    "signedTransaction",
    "privateKey",
    "signedUrl",
    "*.token",
    "*.signature",
    "*.signedTransaction",
    "*.privateKey",
    "*.signedUrl",
  ],
  censor: "[REDACTED]",
};

// Error class and code only: messages can embed RPC URLs, SQL or signed payloads.
export function errorTag(error: unknown) {
  if (!(error instanceof Error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? `${error.name}:${code}`
    : error.name;
}
