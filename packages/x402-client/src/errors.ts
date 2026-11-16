// Every failure the SDK raises. `code` is the API's own error code when the
// API answered with one (`{ "error": "QUOTE_EXPIRED" }`), otherwise one of the
// client-side codes below. `status` is the HTTP status, or 0 when nothing was
// answered (a refusal before sending, a timeout).
export type ClientErrorCode =
  // A 4xx/5xx answer without an `error` code.
  | `HTTP_${number}`
  // The answer was not what the protocol promises (no 402, no invocation id, ...).
  | "INVALID_RESPONSE"
  // The 402's quote costs more than `maxAmount`.
  | "SPEND_CAP_EXCEEDED"
  // The 402's quote is for another agent, command or resource than requested.
  | "QUOTE_MISMATCH"
  // The shared x402 client refused to sign (inconsistent quote, wrong buyer, expired, ...).
  | "PAYMENT_NOT_SIGNED"
  // The hold was not funded: the vault rejected or quarantined the payment.
  | "PAYMENT_REJECTED"
  // No terminal state before the deadline.
  | "TIMEOUT"
  // SIWE sign-in did not produce a session.
  | "SIGN_IN_FAILED"
  // The request never got an answer (DNS, connection, TLS).
  | "NETWORK_ERROR"
  // A file upload failed, or the API rejected the stored bytes.
  | "UPLOAD_REJECTED";

export class PayvokeError extends Error {
  override readonly name = "PayvokeError";
  constructor(
    readonly code: ClientErrorCode | (string & {}),
    readonly status = 0,
    readonly body: unknown = null,
    readonly invocationId?: string,
    options?: ErrorOptions,
  ) {
    super(status ? `${status} ${code}` : code, options);
  }
}

// The API's error code, from `{ "error": "CODE" }` (Payvoke) or
// `{ "code": "CODE" }` (Better Auth, under /v1/auth).
export function apiError(status: number, body: unknown, invocationId?: string) {
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code =
    typeof fields.error === "string"
      ? fields.error
      : typeof fields.code === "string"
        ? fields.code
        : `HTTP_${status}`;
  return new PayvokeError(code, status, body, invocationId);
}
