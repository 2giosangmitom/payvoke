import type { PaymentSigner, QuoteDocument } from "@payvoke/shared/x402";
import type { Address, Hex } from "viem";

// A buyer wallet that can sign in (EIP-4361) and pay (EIP-712). A viem
// `LocalAccount` (privateKeyToAccount) is one.
export type PayvokeAccount = PaymentSigner & {
  signMessage(args: { message: string }): Promise<Hex>;
};

// `GET /v1/x402/catalog`.
export type CatalogItem = {
  appId: string;
  appName: string;
  command: string;
  description: string;
  // The base price, atomic USDC (6 decimals).
  amount: string;
  // Higher prices for bigger inputs: UTF-8 bytes of the string arguments plus
  // the file sizes. The 402 states the exact price before anything is signed.
  tiers: { minInputBytes: number; amount: string }[];
  deliverySeconds: number;
  reviewSeconds: number;
  inputSchema: Record<string, unknown>;
  resource: string;
  available: boolean;
};
export type Catalog = {
  x402Version: 2;
  scheme: string;
  network: string;
  asset: Address;
  vault: Address | null;
  items: CatalogItem[];
};

// Settlement journal states (`paymentStatus` of GET /v1/invocations/:id).
export type PaymentStatus = "PENDING" | "UNKNOWN" | "HELD" | "REJECTED" | "QUARANTINED";
// Invocation execution states.
export type ExecutionStatus =
  | "NOT_STARTED"
  | "QUEUED"
  | "ACKED"
  | "RUNNING"
  | "WAITING_BUYER"
  | "VERIFYING"
  | "DELIVERED"
  | "FAILED";
// The vault hold, from the finalized chain projection.
export type HoldStatus = "HELD" | "PARTIALLY_REFUNDED" | "REFUNDED" | "RELEASED" | "RECLAIMED";

export type PaymentReceipt = {
  success: boolean;
  transaction: Hex;
  network: string;
  payer: Address;
  amount: string;
  extra?: { holdId?: Hex; invocationId?: string; quoteId?: string; [key: string]: unknown };
};

// `GET /v1/invocations/:id`.
export type InvocationStatus = {
  invocationId: string;
  threadId: string;
  paymentStatus: PaymentStatus;
  executionStatus: ExecutionStatus;
  financial: {
    status: HoldStatus;
    hold: unknown;
    finalizedBlock: string;
    finalizedBlockHash: string;
  } | null;
  delivery: { artifactVersion: number; evidenceLevel: string; envelopeHash: string } | null;
  transaction: Hex | null;
  failure: { code: string } | null;
  receipt: PaymentReceipt | null;
  nextActions: string[];
};

export type ResultFile = { fileId: string; name: string; contentType: string; size: number };

// A verified delivery, read from the job's thread timeline. `output` is the
// agent's result: a markdown string, or the JSON it reported.
export type JobResult = {
  artifactVersion: number;
  output: unknown;
  // `output` when it is text, else null.
  text: string | null;
  files: ResultFile[];
};

export type Job = InvocationStatus & { result: JobResult | null };

// A buyer file for a FILE argument. Uploaded before the request, it becomes
// the argument's file id; the purchase binds it, so it is used once.
export type FileInput = {
  name: string;
  // One of the API's accepted types, e.g. application/pdf or text/csv.
  contentType: string;
  data: Uint8Array | ArrayBuffer | Blob;
};

// Progress of one hire, in order. `pending` repeats once the funding
// transaction hash is known.
export type HireEvent =
  | {
      type: "challenge";
      invocationId: string;
      quoteId: string;
      quoteDigest: Hex;
      amount: string;
      vault: Address;
      resource: string;
      validUntil: number;
      deliveryDeadline: number;
      quote: QuoteDocument;
    }
  | { type: "uploaded"; field: string; fileId: string; name: string; size: number }
  | { type: "signed"; invocationId: string; quoteDigest: Hex }
  | { type: "pending"; invocationId: string; transaction: Hex | null }
  | {
      type: "held";
      invocationId: string;
      threadId: string | null;
      transaction: Hex | null;
      holdId: Hex | null;
    }
  | { type: "running"; invocationId: string; executionStatus: ExecutionStatus }
  | { type: "delivered"; invocationId: string; result: JobResult | null }
  | { type: "failed"; invocationId: string; reason: string | null }
  | { type: "refunded"; invocationId: string };

export type HireRequest = {
  appId: string;
  command: string;
  arguments: Record<string, unknown>;
  // Files for FILE arguments, by argument name (an array for multi-file ones).
  // To resume a hire with `idempotencyKey`, pass the earlier file ids in
  // `arguments` instead: re-uploading makes new files and a different request.
  files?: Record<string, FileInput | FileInput[]>;
  // Never sign more than this, in atomic USDC (1_000_000n = 1 USDC).
  maxAmount: bigint;
  // Awaited, so a handler can slow the flow down (e.g. to stream a note).
  onEvent?: (event: HireEvent) => void | Promise<void>;
  // Extra veto on the quote, after the SDK's own checks; throw to refuse.
  approve?: (quote: QuoteDocument) => void | Promise<void>;
  // Resume an earlier hire: the same key and arguments replay the same quote.
  idempotencyKey?: string;
  // Default: until the quote's delivery deadline plus two minutes.
  timeoutMs?: number;
  signal?: AbortSignal;
};

export type HireResult = {
  invocationId: string;
  threadId: string;
  idempotencyKey: string;
  amount: string;
  paymentStatus: PaymentStatus;
  executionStatus: ExecutionStatus;
  transaction: Hex | null;
  result: JobResult | null;
};
