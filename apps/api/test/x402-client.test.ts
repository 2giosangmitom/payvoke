import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "bun:test";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { getAddress, type TypedDataDefinition } from "viem";
import {
  VaultClientScheme,
  paymentRequirements,
  paymentResource,
  quoteResource,
  readPaymentIntent,
  validateQuoteDocument,
  type QuoteDocument,
} from "@payvoke/shared/x402";
import {
  readChallenge,
  x402Pay,
  type X402Response,
  type X402Send,
} from "@payvoke/shared/x402/client";
import { buildQuoteDocument } from "../src/modules/quotes/quote-document";

const api = "https://api.payvoke.test";
const invocations = `${api}/v1/invocations`;
const instant = `${api}/v1/x402/apps/app-1/commands/quick_review`;
const vault = getAddress("0x1111111111111111111111111111111111111111");
const buyer = privateKeyToAccount(generatePrivateKey());
const grantSigner = privateKeyToAccount(generatePrivateKey());
const grant = { mode: "grant", grantId: `0x${"a".repeat(64)}`, grantEpoch: 1n } as const;

function quote(resource: string, grossAmount = 500000n): QuoteDocument {
  const terms = {
    deliverySeconds: 60,
    reviewSeconds: 30,
    revisionPolicy: { maxIncluded: 0, description: "None" },
    refundPolicy: "Refund undelivered work",
    sideEffects: "none",
    dataUse: "Only this request",
    verification: { minEvidence: "SIGN" },
  };
  return buildQuoteDocument({
    vault,
    buyer: buyer.address,
    threadId: randomUUID(),
    product: { id: "app-1", payoutAddress: "0x2222222222222222222222222222222222222222" },
    commandId: randomUUID(),
    revision: { terms, reviewSeconds: 30, deliverySeconds: 60 } as never,
    grossAmount,
    deliverySeconds: 60,
    offer: null,
    policy: {
      version: "policy-1",
      feeBps: 500,
      feeRecipient: "0x3333333333333333333333333333333333333333",
      quoteLifetimeSeconds: 120,
      maxHoldSeconds: 600,
      resolutionGraceSeconds: 60,
    } as never,
    schema: { type: "object" },
    effectiveArguments: { cv_text: "hello" },
    history: [],
    files: [],
    resource,
    now: Math.floor(Date.now() / 1000),
  });
}

// What Payvoke's gateway answers to an unpaid request.
function challenge(document: QuoteDocument, url: string, withQuote = false): X402Response {
  // `method` is not in core's ResourceInfo type but is on the wire.
  const resource = { url, method: "POST", description: "Payvoke invocation" };
  const required: PaymentRequired = {
    x402Version: 2,
    resource: { ...resource, mimeType: "application/json" },
    accepts: [paymentRequirements(document)],
  };
  const header = encodePaymentRequiredHeader(required);
  const body = withQuote ? { ...required, extensions: { payvoke: { quote: document } } } : required;
  return {
    status: 402,
    header: (name) => (name.toLowerCase() === "payment-required" ? header : null),
    body: JSON.parse(JSON.stringify(body)),
  };
}

const decode = (headers: Record<string, string>) =>
  JSON.parse(Buffer.from(headers["PAYMENT-SIGNATURE"], "base64").toString("utf8"));

// A transport that answers the 402 first and records the paid retry.
function server(first: X402Response) {
  const sent: Record<string, string>[] = [];
  const send: X402Send = async (headers) => {
    sent.push(headers);
    return sent.length === 1 ? first : { status: 202, header: () => null, body: { ok: true } };
  };
  return { send, sent };
}

describe("x402 client helper", () => {
  it("binds a v3 quote to the resource it names, and v2 quotes to /v1/invocations", () => {
    const document = quote(instant);
    assert.equal(quoteResource(document), instant);
    assert.equal(paymentResource(document, invocations), instant);
    // Another deployment's resource is never accepted for this one.
    assert.throws(() => paymentResource(document, "https://other.payvoke.test/v1/invocations"));
    // A v3 resource is part of the hashed terms: editing it breaks the quote.
    const edited = structuredClone(document);
    (edited.termsSnapshot as Record<string, unknown>).resource = invocations;
    assert.throws(() => validateQuoteDocument(edited, vault, buyer.address), /QUOTE_INCONSISTENT/);
    for (const bad of [`${instant}?x=1`, `${instant}#a`, "https://u:p@api.payvoke.test/v1/x"])
      assert.throws(() => quote(bad));
  });

  it("does the 402 round trip for a quote the caller holds and signs only that quote", async () => {
    const document = quote(invocations, 100000n);
    const { send, sent } = server(challenge(document, invocations));
    const persisted: string[] = [];
    const { response, payment } = await x402Pay({
      resourceUrl: invocations,
      send,
      buyer: buyer.address,
      vault,
      signer: grantSigner,
      funding: grant,
      maxAmount: 100000n,
      quote: document,
      persist: async (record) => {
        persisted.push(record.quoteId);
      },
    });
    assert.equal(response.status, 202);
    assert.deepEqual(sent[0], {});
    assert.deepEqual(persisted, [document.quoteId]);
    const envelope = decode(sent[1]);
    // Exactly the vault envelope: no echoed extensions.
    assert.deepEqual(Object.keys(envelope).sort(), [
      "accepted",
      "payload",
      "resource",
      "x402Version",
    ]);
    assert.deepEqual(payment!.paymentPayload, envelope);
    const intent = await readPaymentIntent(document, envelope, invocations);
    assert.equal(intent.signer, grantSigner.address);
  });

  it("takes an instant quote from the 402 body, approves it and pays above core's $1 default", async () => {
    const document = quote(instant, 2_500_000n);
    const { send, sent } = server(challenge(document, instant, true));
    const seen: string[] = [];
    await x402Pay({
      resourceUrl: instant,
      send,
      buyer: buyer.address,
      vault,
      signer: buyer,
      funding: { mode: "authorization" },
      maxAmount: 2_500_000n,
      approve: (q) => {
        seen.push(q.quoteId);
      },
    });
    assert.deepEqual(seen, [document.quoteId]);
    const envelope = decode(sent[1]);
    assert.equal(envelope.resource.url, instant);
    const intent = await readPaymentIntent(document, envelope, invocations);
    assert.equal(intent.mode, "authorization");
    // The same envelope names the instant URL, so it is refused as a chat payment.
    const moved = { ...envelope, resource: { ...envelope.resource, url: invocations } };
    await assert.rejects(readPaymentIntent(document, moved, invocations), /resource/);
  });

  it("refuses before signing: wrong resource, spend cap, approval, mismatched or missing quote", async () => {
    const document = quote(instant);
    let signed = 0;
    const signer = {
      address: buyer.address,
      signTypedData: async (args: TypedDataDefinition) => {
        signed++;
        return buyer.signTypedData(args as never);
      },
    };
    const pay = (
      overrides: Partial<Parameters<typeof x402Pay>[0]>,
      first = challenge(document, instant, true),
    ) =>
      x402Pay({
        resourceUrl: instant,
        send: server(first).send,
        buyer: buyer.address,
        vault,
        signer,
        funding: { mode: "authorization" },
        maxAmount: 500000n,
        ...overrides,
      });
    // The quote is for the instant URL; paying it as a chat invocation fails.
    await assert.rejects(pay({ resourceUrl: invocations }), /Invalid invocation resource/);
    await assert.rejects(pay({ maxAmount: 499999n }), /Spend cap exceeded/);
    await assert.rejects(
      pay({
        approve: () => {
          throw new Error("declined");
        },
      }),
      /declined/,
    );
    // A body quote that is not the one the header asks payment for.
    const other = quote(instant);
    const swapped = challenge(document, instant, true);
    (swapped.body as { extensions: { payvoke: { quote: unknown } } }).extensions.payvoke.quote =
      other;
    await assert.rejects(pay({}, swapped), /do not match/);
    // The body must repeat the header.
    const tampered = challenge(document, instant, true);
    (tampered.body as { accepts: { amount: string }[] }).accepts[0].amount = "1";
    await assert.rejects(pay({}, tampered), /disagree/);
    await assert.rejects(pay({}, challenge(document, instant, false)), /no Payvoke quote/);
    // A buyer that is not the quote's.
    await assert.rejects(pay({ buyer: grantSigner.address }), /QUOTE_INCONSISTENT/);
    assert.equal(signed, 0);
    // A v3 quote's client scheme only accepts its own resource.
    assert.throws(
      () =>
        new VaultClientScheme({
          document,
          buyer: buyer.address,
          vault,
          resourceUrl: invocations,
          signer,
          funding: { mode: "authorization" },
          maxAmount: 500000n,
          persist: async () => {},
        }),
      /Invalid invocation resource/,
    );
  });

  it("returns a first answer other than 402 without signing", async () => {
    const answer: X402Response = { status: 404, header: () => null, body: { error: "X" } };
    const { response, payment } = await x402Pay({
      resourceUrl: instant,
      send: async () => answer,
      buyer: buyer.address,
      vault,
      signer: buyer,
      funding: { mode: "authorization" },
      maxAmount: 1n,
    });
    assert.equal(response, answer);
    assert.equal(payment, null);
    assert.throws(() => readChallenge(answer), /Expected a 402/);
  });
});
