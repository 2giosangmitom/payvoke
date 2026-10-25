import { api, apiOrigin } from "./api";
import { paymentRequirements, validateQuoteDocument, type QuoteDocument } from "@payvoke/x402";
import { paymentTypes, vaultAdmissionAbi, vaultDomain } from "@payvoke/protocol";
import type { Address, Hex } from "viem";

export type CommandOptionType = "STRING" | "INTEGER" | "NUMBER" | "BOOLEAN";
export type CommandOption = {
  name: string;
  description?: string;
  type: CommandOptionType;
  required?: boolean;
  choices?: (string | number)[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
};
export type RevisionPolicy = { maxIncluded: number; description: string };
export type CommandRevision = {
  id: string;
  options: CommandOption[];
  inputSchema: unknown;
  outputSchema: unknown | null;
  positionalParameter: string | null;
  grossAmount: string;
  terms: {
    deliverySeconds: number;
    reviewSeconds: number;
    revisionPolicy: RevisionPolicy;
    refundPolicy: string;
    sideEffects: string;
    dataUse: string;
  };
  deliverySeconds: number;
  reviewSeconds: number;
};
export type ThreadCommand = {
  id: string;
  name: string;
  description: string;
  revision: CommandRevision | null;
};
export type ThreadApp = {
  id: string;
  name: string;
  description: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  status: string;
  availability: "AVAILABLE" | "UNAVAILABLE" | "SUSPENDED";
};
export type ThreadSummary = {
  id: string;
  title: string | null;
  app: { id: string; name: string; description: string | null; availability: string };
  lastMessageAt: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type ThreadDetail = {
  id: string;
  appId: string;
  title: string | null;
  archivedAt: string | null;
  app: ThreadApp;
  activeQuoteId: string | null;
  defaultCommandId: string | null;
  chatTextParameter: string | null;
  revisionPolicy: RevisionPolicy | null;
  commands: ThreadCommand[];
};
// Whole OpenUI Lang program for one surface; each snapshot replaces the last.
export type OpenUISurfaceContent = { source: string; invocationId?: string; surfaceId?: string };
export type AguiEvent = {
  type: string;
  messageId?: string;
  role?: string;
  delta?: string;
  activityType?: string;
  content?: OpenUISurfaceContent;
  message?: string;
};
export type ChatQuestion = {
  id: string;
  invocationId: string;
  questionId: string;
  prompt: string;
  inputSchema: unknown;
  chatTextParameter: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
};
export type ChatAnswer = {
  questionId: string;
  invocationId: string;
  arguments: Record<string, unknown>;
  createdAt: string;
};
export type ChatRevision = {
  id: string;
  invocationId: string;
  reason: string;
  status: string;
  createdAt: string;
};
export type ChatSnapshot = {
  cursor: string;
  messages: { messageId: string; invocationId: string; content: string; complete: boolean }[];
  surfaces: { messageId: string; content: OpenUISurfaceContent }[];
  invocations: { id: string; executionStatus: string; output: unknown | null }[];
  prompts: { quoteId: string; invocationId: string; text: string; paid: boolean }[];
  questions: ChatQuestion[];
  answers: ChatAnswer[];
  revisions: ChatRevision[];
};

export const getThreads = (query?: string) =>
  api<{ items: ThreadSummary[]; nextCursor: string | null }>(
    `/v1/threads${query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`,
  );
export const newThread = (appId: string, clientRequestId = crypto.randomUUID()) =>
  api<{ id: string; appId: string; title: string | null }>("/v1/threads", "POST", {
    appId,
    clientRequestId,
  });
export const getThread = (id: string) => api<ThreadDetail>(`/v1/threads/${encodeURIComponent(id)}`);
export const renameThread = (id: string, title: string) =>
  api<{ title: string }>(`/v1/threads/${encodeURIComponent(id)}`, "PATCH", { title });
export const archiveThread = (id: string) =>
  api<{ archived: boolean }>(`/v1/threads/${encodeURIComponent(id)}/archive`, "POST");
export const getSnapshot = (id: string) =>
  api<ChatSnapshot>(`/v1/threads/${encodeURIComponent(id)}/ag-ui/snapshot`);
export const getPendingQuote = (id: string) =>
  api<{ quote: QuoteDocument | null }>(`/v1/quotes/${encodeURIComponent(id)}`);
export const answerQuestion = (
  invocationId: string,
  questionId: string,
  values: Record<string, unknown>,
  clientRequestId: string,
) =>
  api<{ questionId: string; runId: string; executionStatus: string }>(
    `/v1/invocations/${encodeURIComponent(invocationId)}/answers`,
    "POST",
    {
      questionId,
      arguments: values,
      clientRequestId,
    },
    { "idempotency-key": clientRequestId },
  );
export const requestRevision = (invocationId: string, reason: string, clientRequestId: string) =>
  api<{ revisionId: string; runId: string; executionStatus: string }>(
    `/v1/invocations/${encodeURIComponent(invocationId)}/revisions`,
    "POST",
    {
      reason,
      clientRequestId,
    },
    { "idempotency-key": clientRequestId },
  );

export async function quoteFor(
  thread: ThreadDetail,
  commandId: string,
  args: Record<string, unknown>,
) {
  const clientRequestId = crypto.randomUUID();
  return api<QuoteDocument>(
    "/v1/quotes",
    "POST",
    {
      threadId: thread.id,
      commandId,
      arguments: args,
      contextSelection: { messageIds: [], briefVersionId: null, fileIds: [] },
      clientRequestId,
    },
    { "idempotency-key": clientRequestId },
  );
}

export type WalletGrant = {
  signer: Address;
  epoch: bigint;
  expiresAt: number;
  maxPerCall: bigint;
  periodSeconds: number;
  maxPerPeriod: bigint;
  maxTotal: bigint;
  spentTotal: bigint;
  spentInPeriod: bigint;
  currentPeriod: bigint;
  revoked: boolean;
};

// The UI must check the active on-chain grant before presenting the wallet signature request.
export async function checkGrant(
  quote: QuoteDocument,
  grantId: Hex,
  buyer: Address,
  wallet: Address,
  read: (args: {
    address: Address;
    abi: typeof vaultAdmissionAbi;
    functionName: "getGrant" | "availableBalance";
    args: readonly [Address, Hex] | readonly [Address];
  }) => Promise<unknown>,
): Promise<{ epoch: bigint }> {
  validateQuoteDocument(quote, quote.vault as Address, buyer);
  if (quote.network !== "eip155:43113" || Date.now() >= quote.validUntil * 1000)
    throw new Error("Quote expired or wrong network.");
  const raw = await read({
    address: quote.vault as Address,
    abi: vaultAdmissionAbi,
    functionName: "getGrant",
    args: [buyer, grantId],
  });
  const grant = raw as {
    config: {
      signer: Address;
      expiresAt: number;
      maxPerCall: bigint;
      periodSeconds: number;
      maxPerPeriod: bigint;
      maxTotal: bigint;
    };
    epoch: bigint;
    spentTotal: bigint;
    spentInPeriod: bigint;
    currentPeriod: bigint;
    revoked: boolean;
  };
  if (
    !grant ||
    grant.revoked ||
    grant.epoch === 0n ||
    grant.config.signer.toLowerCase() !== wallet.toLowerCase() ||
    Number(grant.config.expiresAt) <= Math.floor(Date.now() / 1000)
  )
    throw new Error("Grant is missing, expired, revoked or delegated to another signer.");
  const amount = BigInt(quote.grossAmount);
  const period = BigInt(Math.floor(Date.now() / 1000)) / BigInt(grant.config.periodSeconds || 1);
  const spent = grant.currentPeriod === period ? grant.spentInPeriod : 0n;
  if (
    grant.config.periodSeconds < 1 ||
    amount > grant.config.maxPerCall ||
    spent + amount > grant.config.maxPerPeriod ||
    grant.spentTotal + amount > grant.config.maxTotal
  )
    throw new Error("Grant spending limits exceeded.");
  const available = await read({
    address: quote.vault as Address,
    abi: vaultAdmissionAbi,
    functionName: "availableBalance",
    args: [buyer],
  });
  if (BigInt(available as bigint) < amount) throw new Error("Insufficient vault balance.");
  return { epoch: grant.epoch };
}

export async function submitSigned(
  quote: QuoteDocument,
  grantId: Hex,
  epoch: bigint,
  sign: (args: {
    domain: ReturnType<typeof vaultDomain>;
    types: typeof paymentTypes;
    primaryType: "DebitAuthorization";
    message: { quoteDigest: Hex; grantId: Hex; grantEpoch: bigint };
  }) => Promise<Hex>,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  const signature = await sign({
    domain: vaultDomain(quote.vault as Address),
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: { quoteDigest: quote.quoteDigest, grantId, grantEpoch: epoch },
  });
  const envelope = {
    x402Version: 2,
    accepted: paymentRequirements(quote),
    resource: { url: new URL("/v1/invocations", apiOrigin).href, method: "POST" },
    payload: {
      authorization: { quoteDigest: quote.quoteDigest, grantId, grantEpoch: epoch.toString() },
      signature,
    },
  };
  // All envelope values are ASCII. x402 v2 transmits the canonical JSON as base64.
  const header = btoa(JSON.stringify(envelope));
  return api<unknown>(
    "/v1/invocations",
    "POST",
    { quoteId: quote.quoteId },
    {
      "idempotency-key": quote.invocationId,
      "payment-signature": header,
    },
  );
}
