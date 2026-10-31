import {
  debitTypedData,
  paymentSignatureHeader,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { vaultAdmissionAbi } from "@payvoke/shared/protocol";
import type { Address, Hex } from "viem";
import { ApiError, apiOrigin, call, callAs, client } from "@/src/lib/api/client";

const invocations = client.v1.invocations;

// Every quote is for an open offer from the app's bot.
export async function quoteFor(threadId: string, offerId: string, fileIds: string[] = []) {
  const clientRequestId = crypto.randomUUID();
  return callAs<QuoteDocument>(
    client.v1.quotes.$post(
      {
        json: {
          threadId,
          offerId,
          contextSelection: { messageIds: [], briefVersionId: null, fileIds },
          clientRequestId,
        },
      },
      { headers: { "idempotency-key": clientRequestId } },
    ),
  );
}
export const getPendingQuote = (quoteId: string) =>
  callAs<{ quote: QuoteDocument | null }>(
    client.v1.quotes[":quoteId"].$get({ param: { quoteId } }),
  );

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
  sign: (args: ReturnType<typeof debitTypedData>) => Promise<Hex>,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  const signature = await sign(debitTypedData(quote, grantId, epoch));
  const header = paymentSignatureHeader(
    quote,
    grantId,
    epoch,
    signature,
    new URL("/v1/invocations", apiOrigin).href,
  );
  try {
    await call(
      invocations.$post(
        { json: { quoteId: quote.quoteId } },
        { headers: { "idempotency-key": quote.invocationId, "payment-signature": header } },
      ),
    );
  } catch (cause) {
    // The first answer is usually "not settled yet": the API journaled the
    // signed authorization and its worker is putting the hold on chain.
    // The status endpoint, not that answer, says how it ends.
    if (!(cause instanceof ApiError) || ![402, 503].includes(cause.status)) throw cause;
    await waitForHold(quote.invocationId, cause);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Polls the payment until the vault holds it or it stops for good. A hold
// takes a few blocks plus finality, so this allows two minutes.
async function waitForHold(invocationId: string, first: ApiError) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    let status: { paymentStatus: string; failure: { code: string } | null };
    try {
      status = await call(invocations[":id"].$get({ param: { id: invocationId } }));
    } catch (cause) {
      // No journaled payment at all: the first error is the real one.
      if (cause instanceof ApiError && cause.status === 404) throw first;
      throw cause;
    }
    if (status.paymentStatus === "HELD") return;
    if (status.paymentStatus === "REJECTED")
      throw new Error(`Payment rejected: ${status.failure?.code ?? "unknown reason"}.`);
    if (status.paymentStatus === "QUARANTINED")
      throw new Error(
        "Payment is held for review and was not taken. Contact support with this job id: " +
          invocationId,
      );
    await sleep(3_000);
  }
  throw new Error("The payment is still settling. It will show in this thread once it is held.");
}
