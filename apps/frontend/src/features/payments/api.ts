import {
  authorizationTypedData,
  debitTypedData,
  validateQuoteDocument,
  type ClientFunding,
  type PaymentSigner,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import { readChallenge, signChallenge, type X402Send } from "@payvoke/shared/x402/client";
import { usdcAbi, vaultAdmissionAbi } from "@payvoke/shared/protocol";
import { getAddress, type Address, type Hex, type PublicClient } from "viem";
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
// An instant (fixed-price) command bought over x402, with no chat. The
// Idempotency-Key and body stay the same for the unpaid and the paid request:
// together they select the one quote the 402 issued.
export type InstantOrder = {
  appId: string;
  command: string;
  arguments: Record<string, unknown>;
  key: string;
};

const instantRoute = client.v1.x402.apps[":appId"].commands[":command"];

function instantSend(order: InstantOrder): X402Send {
  return async (headers) => {
    const response = await instantRoute.$post(
      {
        param: { appId: order.appId, command: order.command },
        json: { arguments: order.arguments },
      },
      { headers: { "idempotency-key": order.key, ...headers } },
    );
    return {
      status: response.status,
      header: (name) => response.headers.get(name),
      body: await response.json().catch(() => null),
    };
  };
}

const instantUrl = (order: InstantOrder) =>
  new URL(
    `/v1/x402/apps/${encodeURIComponent(order.appId)}/commands/${encodeURIComponent(order.command)}`,
    apiOrigin,
  ).href;

// The unpaid half of an instant purchase: the 402 challenge and the Payvoke
// quote in its body, checked before the buyer sees the price. The API issued
// it to the signed-in account; PaymentConfirm makes sure the connected wallet
// is that buyer. Nothing is signed here: PaymentConfirm pays it with `order`.
export async function orderInstant(
  input: Omit<InstantOrder, "key">,
): Promise<{ quote: QuoteDocument; order: InstantOrder }> {
  const order = { ...input, key: crypto.randomUUID() };
  const first = await instantSend(order)({});
  if (first.status !== 402) throw failure(first.status, first.body);
  const { quote } = readChallenge(first);
  checkQuote(quote, getAddress(quote.protocolQuote.buyer));
  return { quote, order };
}
export const getPendingQuote = (quoteId: string) =>
  callAs<{ quote: QuoteDocument | null; instant?: InstantOrder }>(
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
  order?: InstantOrder,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  // The x402 scheme asks this signer only for the quote's USDC authorization.
  const signer: PaymentSigner = {
    address: getAddress(quote.protocolQuote.buyer),
    signTypedData: (args) => sign(args as ReturnType<typeof authorizationTypedData>),
  };
  await submitPayment(quote, signer, { mode: "authorization" }, order);
}

// Pays with a spending grant's key (one-click or a coding agent).
export async function payWithGrant(
  quote: QuoteDocument,
  grantId: Hex,
  epoch: bigint,
  sign: (args: ReturnType<typeof debitTypedData>) => Promise<Hex>,
  signerAddress?: Address,
  order?: InstantOrder,
) {
  if (Date.now() >= quote.validUntil * 1000) throw new Error("Quote expired. Prepare a new quote.");
  // In grant mode the scheme asks only for the debit of this quote; the vault,
  // not the client, checks the signer against the grant.
  const signer: PaymentSigner = {
    address: signerAddress ?? getAddress(quote.protocolQuote.buyer),
    signTypedData: (args) => sign(args as ReturnType<typeof debitTypedData>),
  };
  await submitPayment(quote, signer, { mode: "grant", grantId, grantEpoch: epoch }, order);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Refusals before anything was journaled that a moment later may pass: the
// chain RPC or the facilitator was briefly unavailable.
const transient = new Set(["rpc_unavailable", "settlement_unavailable"]);
const SUBMIT_ATTEMPTS = 4;

const failure = (status: number, body: unknown) =>
  new ApiError(status, (body as { error?: string } | null)?.error || `HTTP ${status}`);

// The x402 round trip for a quote the buyer approved: post it unpaid, read
// the 402 challenge, sign exactly this quote and post again with the
// PAYMENT-SIGNATURE header. A chat quote is paid at /v1/invocations; an
// instant one at the command URL that issued it, with the same key and body.
async function submitPayment(
  quote: QuoteDocument,
  signer: PaymentSigner,
  funding: ClientFunding,
  order?: InstantOrder,
) {
  const chatSend: X402Send = async (headers) => {
    const response = await invocations.$post(
      { json: { quoteId: quote.quoteId } },
      { headers: { "idempotency-key": quote.invocationId, ...headers } },
    );
    return {
      status: response.status,
      header: (name) => response.headers.get(name),
      body: await response.json().catch(() => null),
    };
  };
  const send = order ? instantSend(order) : chatSend;
  const challenge = await send({});
  if (challenge.status !== 402) throw failure(challenge.status, challenge.body);
  const payment = await signChallenge(readChallenge(challenge, quote), {
    resourceUrl: order ? instantUrl(order) : new URL("/v1/invocations", apiOrigin).href,
    buyer: getAddress(quote.protocolQuote.buyer),
    vault: getAddress(quote.vault),
    signer,
    funding,
    // The buyer approved this quote's price, and nothing above it.
    maxAmount: BigInt(quote.grossAmount),
  });
  for (let attempt = 1; ; attempt++) {
    const answer = await send(payment.headers);
    // 202: the payment is journaled (PENDING) or already held (HELD).
    if (answer.status === 202) {
      if ((answer.body as { paymentStatus?: string } | null)?.paymentStatus === "HELD") return;
      await waitForHold(quote.invocationId, failure(answer.status, answer.body));
      return;
    }
    const cause = failure(answer.status, answer.body);
    // Nothing was recorded or sent on chain, so the same signed payment can
    // simply be submitted again while the quote is still valid.
    if (
      answer.status === 503 &&
      transient.has(cause.code) &&
      attempt < SUBMIT_ATTEMPTS &&
      Date.now() + 2_000 * attempt < quote.validUntil * 1000
    ) {
      await sleep(2_000 * attempt);
      continue;
    }
    // A 402 is a refusal of this signature; a 503 may still have journaled
    // it, and the status endpoint says how that ends.
    if (answer.status !== 503) throw cause;
    await waitForHold(quote.invocationId, cause);
    return;
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
