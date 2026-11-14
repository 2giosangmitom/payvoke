import {
  authorizationPayment,
  authorizationTypedData,
  debitTypedData,
  grantPayment,
  paymentSignatureHeader,
  validateQuoteDocument,
  type PaymentBody,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { usdcAbi, vaultAdmissionAbi } from "@payvoke/shared/protocol";
import type { Address, Hex, PublicClient } from "viem";
import { ApiError, apiOrigin, call, callAs, client } from "@/src/lib/api/client";
import { usdc } from "@/src/features/wallet/api";

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

type Reader = Pick<PublicClient, "readContract">;

function checkQuote(quote: QuoteDocument, buyer: Address) {
  validateQuoteDocument(quote, quote.vault as Address, buyer);
  if (quote.network !== "eip155:43113" || Date.now() >= quote.validUntil * 1000)
    throw new Error("Quote expired or wrong network.");
}

// The job is funded from the buyer's wallet, so the wallet must hold it.
export async function checkWallet(quote: QuoteDocument, buyer: Address, client: Reader) {
  checkQuote(quote, buyer);
  const amount = BigInt(quote.grossAmount);
  const balance = await client.readContract({
    address: quote.asset as Address,
    abi: usdcAbi,
    functionName: "balanceOf",
    args: [buyer],
  });
  if (balance < amount)
    throw new Error(
      `Your wallet holds ${usdc(balance)} USDC; this job needs ${usdc(amount)} USDC.`,
    );
}

// The UI checks the active on-chain grant before a one-click key signs: its
// limits, and that the vault may still pull the price from the wallet.
export async function checkGrant(
  quote: QuoteDocument,
  grantId: Hex,
  buyer: Address,
  signer: Address,
  client: Reader,
): Promise<{ epoch: bigint }> {
  await checkWallet(quote, buyer, client);
  const vault = quote.vault as Address;
  const [grant, allowance] = await Promise.all([
    client.readContract({
      address: vault,
      abi: vaultAdmissionAbi,
      functionName: "getGrant",
      args: [buyer, grantId],
    }),
    client.readContract({
      address: quote.asset as Address,
      abi: usdcAbi,
      functionName: "allowance",
      args: [buyer, vault],
    }),
  ]);
  if (
    grant.revoked ||
    grant.epoch === 0n ||
    grant.config.signer.toLowerCase() !== signer.toLowerCase() ||
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
  if (allowance < amount)
    throw new Error(
      "The one-click allowance left is below this price. Raise the limit or sign in your wallet.",
    );
  return { epoch: grant.epoch };
}

// Pays with the buyer's own wallet: one USDC authorization for this quote,
// no gas and no deposit. The relayer moves it into the escrow.
export async function payFromWallet(
  quote: QuoteDocument,
  sign: (args: ReturnType<typeof authorizationTypedData>) => Promise<Hex>,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  await submitPayment(quote, authorizationPayment(await sign(authorizationTypedData(quote))));
}

// Pays with a spending grant's key (one-click or a coding agent).
export async function payWithGrant(
  quote: QuoteDocument,
  grantId: Hex,
  epoch: bigint,
  sign: (args: ReturnType<typeof debitTypedData>) => Promise<Hex>,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  const signature = await sign(debitTypedData(quote, grantId, epoch));
  await submitPayment(quote, grantPayment(quote, grantId, epoch, signature));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Refusals before anything was journaled that a moment later may pass: the
// chain RPC or the facilitator was briefly unavailable.
const transient = new Set(["rpc_unavailable", "settlement_unavailable"]);
const SUBMIT_ATTEMPTS = 4;

async function submitPayment(quote: QuoteDocument, payload: PaymentBody) {
  const header = paymentSignatureHeader(quote, payload, new URL("/v1/invocations", apiOrigin).href);
  for (let attempt = 1; ; attempt++) {
    try {
      await call(
        invocations.$post(
          { json: { quoteId: quote.quoteId } },
          { headers: { "idempotency-key": quote.invocationId, "payment-signature": header } },
        ),
      );
      return;
    } catch (cause) {
      // Nothing was recorded or sent on chain, so the same signed payment can
      // simply be submitted again while the quote is still valid.
      if (
        cause instanceof ApiError &&
        cause.status === 503 &&
        transient.has(cause.code) &&
        attempt < SUBMIT_ATTEMPTS &&
        Date.now() + 2_000 * attempt < quote.validUntil * 1000
      ) {
        await sleep(2_000 * attempt);
        continue;
      }
      // The first answer is usually "not settled yet": the API journaled the
      // signed authorization and its worker is putting the hold on chain.
      // The status endpoint, not that answer, says how it ends.
      if (!(cause instanceof ApiError) || ![402, 503].includes(cause.status)) throw cause;
      await waitForHold(quote.invocationId, cause);
      return;
    }
  }
}

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
