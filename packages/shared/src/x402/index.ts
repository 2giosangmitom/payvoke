import {
  businessKey,
  canonicalSnapshot,
  hashQuote,
  hashAuthorization,
  hashReceiveAuthorization,
  hashSnapshot,
  paymentTypes,
  receiveAuthorizationTypedData,
  vaultDomain,
  type DebitAuthorization,
  type FundingMode,
  type InvocationQuote,
  type Json,
} from "@payvoke/shared/protocol";
import {
  getAddress,
  isHex,
  recoverTypedDataAddress,
  zeroAddress,
  type Address,
  type Hex,
  type TypedDataDefinition,
} from "viem";
import type {
  AssetAmount,
  Network,
  PaymentPayloadContext,
  PaymentPayload,
  PaymentRequirements,
  Price,
  SchemeNetworkClient,
  SchemeClientHooks,
  SchemeNetworkServer,
  SupportedKind,
} from "@x402/core/types";

export const NETWORK = "eip155:43113" as const;
export const ASSET = "0x5425890298aed601595a70AB815c96711a31Bc65" as const;
export const SCHEME = "payvoke-escrow";
export const SCHEME_VERSION = "2";

// Integers on the wire are canonical decimal strings, including uint16/uint48.
export type WireQuote = { [K in keyof InvocationQuote]: string };
export type QuoteDocument = {
  quoteId: string;
  invocationId: string;
  sessionId: string;
  productId: string;
  productVersion: number;
  commandId: string;
  network: typeof NETWORK;
  asset: string;
  vault: string;
  providerPayout: string;
  grossAmount: string;
  feeBps: number;
  feeRecipient: string;
  validUntil: number;
  deliveryDeadline: number;
  releaseNotBefore: number;
  resolveBy: number;
  policyVersion: string;
  quoteLifetimeSeconds: number;
  quoteDigest: Hex;
  inputHash: Hex;
  termsHash: Hex;
  policyHash: Hex;
  effectiveArguments: Json;
  contextManifest: Json;
  inputSnapshot: Json;
  termsSnapshot: Json;
  policySnapshot: Json;
  protocolQuote: WireQuote;
};

export function wireQuote(quote: InvocationQuote): WireQuote {
  return Object.fromEntries(
    paymentTypes.InvocationQuote.map(({ name }) => [name, String(quote[name])]),
  ) as WireQuote;
}

function integer(value: unknown, bits: number): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error("Invalid canonical integer");
  }
  const n = BigInt(value);
  if (n >= 1n << BigInt(bits)) throw new Error("Integer out of range");
  return n;
}

export function readQuote(value: WireQuote): InvocationQuote {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid quote");
  if (Object.keys(value).length !== paymentTypes.InvocationQuote.length) {
    throw new Error("Invalid quote fields");
  }
  const result: Record<string, unknown> = {};
  for (const { name, type } of paymentTypes.InvocationQuote) {
    const field = value[name];
    if (typeof field !== "string") throw new Error("Missing quote field");
    if (type === "address") result[name] = getAddress(field);
    else if (type === "bytes32") {
      if (!isHex(field, { strict: true }) || field.length !== 66)
        throw new Error("Invalid bytes32");
      result[name] = field.toLowerCase();
    } else {
      const bits = Number(type.slice(4));
      const n = integer(field, bits);
      result[name] = bits <= 48 ? Number(n) : n;
    }
  }
  return result as InvocationQuote;
}

export function sameJson(left: unknown, right: unknown): boolean {
  return canonicalSnapshot(left as Json) === canonicalSnapshot(right as Json);
}

function object(value: Json): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid snapshot");
  return value;
}

function keys(value: Record<string, Json>, expected: string[]) {
  if (!sameJson(Object.keys(value).sort(), expected.toSorted()))
    throw new Error("Invalid snapshot fields");
}

function sameAddress(value: unknown, expected: string): boolean {
  try {
    return typeof value === "string" && getAddress(value) === getAddress(expected);
  } catch {
    return false;
  }
}

// A paid resource URL as Payvoke issues it: absolute http(s), already in
// canonical form, with no credentials, query or fragment that could make two
// spellings of one URL compare unequal.
export function validResourceUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.href === value &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

// The URL a quote may be paid at. TermsSnapshot v3 freezes it into the terms
// hash, so the buyer's signature (over the quote digest) is bound to it; v2
// quotes predate that and are paid at the deployment's invocation resource.
export function quoteResource(document: QuoteDocument): string | null {
  const terms = document.termsSnapshot;
  if (!terms || typeof terms !== "object" || Array.isArray(terms)) return null;
  return terms.schemaVersion === 3 && typeof terms.resource === "string" ? terms.resource : null;
}

// The resource a payment for this quote must name. A v3 quote must have been
// issued by this deployment: same origin as its default invocation resource.
export function paymentResource(document: QuoteDocument, deploymentResource: string): string {
  const own = quoteResource(document);
  if (own === null) return deploymentResource;
  if (!validResourceUrl(own) || new URL(own).origin !== new URL(deploymentResource).origin)
    throw new Error("Foreign payment resource");
  return own;
}

// Used both before advertising a persisted quote and before the client signs it.
export function validateQuoteDocument(document: QuoteDocument, vault: Address, buyer: Address) {
  const q = readQuote(document.protocolQuote);
  const input = object(document.inputSnapshot);
  const terms = object(document.termsSnapshot);
  const policy = object(document.policySnapshot);
  const definition = object(terms.definition);
  // v1: fixed-price command. v2: an accepted provider offer, whose summary and
  // negotiated conversation are frozen into the input hash.
  keys(input, [
    "schemaVersion",
    "sessionId",
    "productId",
    "productVersion",
    "commandId",
    "commandSchemaHash",
    "arguments",
    "context",
    ...(input.schemaVersion === 2 ? ["offer"] : []),
  ]);
  // v2: paid at the deployment's /v1/invocations. v3: also names its resource.
  keys(terms, [
    "schemaVersion",
    "productId",
    "productVersion",
    "commandId",
    "definition",
    "deliveryDeadline",
    ...(terms.schemaVersion === 3 ? ["resource"] : []),
  ]);
  keys(policy, [
    "schemaVersion",
    "policyVersion",
    "feeBps",
    "feeRecipient",
    "quoteLifetimeSeconds",
    "maxHoldSeconds",
    "resolutionGraceSeconds",
  ]);
  const context = object(input.context);
  keys(context, ["messages", "brief", "files"]);
  const assert = (condition: boolean) => {
    if (!condition) throw new Error("QUOTE_INCONSISTENT");
  };
  assert(document.network === NETWORK && getAddress(document.asset) === getAddress(ASSET));
  assert(getAddress(document.vault) === getAddress(vault) && q.buyer === getAddress(buyer));
  assert(q.asset === getAddress(ASSET));
  assert(q.buyer !== zeroAddress && q.provider !== zeroAddress && q.feeRecipient !== zeroAddress);
  assert(getAddress(vault) !== zeroAddress);
  assert(q.invocationKey === businessKey("invocation", document.invocationId));
  assert(q.quoteKey === businessKey("quote", document.quoteId));
  assert(q.usageSessionKey === businessKey("session", document.sessionId));
  assert(q.productKey === businessKey("product", document.productId));
  assert(q.commandKey === businessKey("command", document.commandId));
  assert(q.productVersion === BigInt(document.productVersion));
  assert(q.provider === getAddress(document.providerPayout));
  assert(q.grossAmount > 0n && q.grossAmount.toString() === document.grossAmount);
  assert(q.feeBps === document.feeBps && q.feeBps <= 10000);
  assert(q.feeRecipient === getAddress(document.feeRecipient));
  for (const field of [
    "validUntil",
    "deliveryDeadline",
    "releaseNotBefore",
    "resolveBy",
  ] as const) {
    assert(q[field] === document[field]);
  }
  assert(q.validUntil < q.deliveryDeadline && q.deliveryDeadline <= q.releaseNotBefore);
  assert(q.releaseNotBefore < q.resolveBy);
  assert(Number.isSafeInteger(document.productVersion) && document.productVersion > 0);
  // TermsSnapshot v2 carries the evidence floor that gates release (M05); v3
  // adds the payment resource.
  assert(
    (input.schemaVersion === 1 || input.schemaVersion === 2) &&
      (terms.schemaVersion === 2 || terms.schemaVersion === 3) &&
      policy.schemaVersion === 1,
  );
  if (terms.schemaVersion === 3) assert(validResourceUrl(terms.resource));
  if (input.schemaVersion === 2) {
    const offer = object(input.offer);
    keys(offer, ["offerId", "summary", "conversation", "conversationHash"]);
    assert(typeof offer.offerId === "string" && offer.offerId.length > 0);
    assert(typeof offer.summary === "string" && offer.summary.length > 0);
    assert(Array.isArray(offer.conversation));
    assert(
      typeof offer.conversationHash === "string" && /^0x[0-9a-f]{64}$/.test(offer.conversationHash),
    );
  }
  const verification = object(definition.verification);
  assert(verification.minEvidence === "SIGN" || verification.minEvidence === "REC");
  assert(input.sessionId === document.sessionId);
  assert(
    typeof input.commandSchemaHash === "string" && /^0x[0-9a-f]{64}$/.test(input.commandSchemaHash),
  );
  assert(Array.isArray(context.messages) && Array.isArray(context.files));
  for (const snapshot of [input, terms]) {
    assert(snapshot.productId === document.productId);
    assert(snapshot.productVersion === document.productVersion);
    assert(snapshot.commandId === document.commandId);
  }
  assert(terms.deliveryDeadline === q.deliveryDeadline);
  assert(
    typeof definition.deliverySeconds === "number" &&
      Number.isSafeInteger(definition.deliverySeconds) &&
      definition.deliverySeconds > 0,
  );
  assert(
    typeof definition.reviewSeconds === "number" &&
      Number.isSafeInteger(definition.reviewSeconds) &&
      definition.reviewSeconds >= 0,
  );
  assert(q.deliveryDeadline - q.validUntil === definition.deliverySeconds);
  assert(q.releaseNotBefore - q.deliveryDeadline === definition.reviewSeconds);
  const revision = object(definition.revisionPolicy);
  assert(
    typeof revision.maxIncluded === "number" &&
      Number.isSafeInteger(revision.maxIncluded) &&
      revision.maxIncluded >= 0,
  );
  for (const text of [
    revision.description,
    definition.refundPolicy,
    definition.sideEffects,
    definition.dataUse,
  ]) {
    assert(typeof text === "string" && text.length > 0);
  }
  assert(policy.policyVersion === document.policyVersion);
  assert(policy.feeBps === q.feeBps);
  assert(policy.feeRecipient === document.feeRecipient);
  assert(policy.quoteLifetimeSeconds === document.quoteLifetimeSeconds);
  assert(Number.isSafeInteger(document.quoteLifetimeSeconds) && document.quoteLifetimeSeconds > 0);
  assert(
    typeof policy.resolutionGraceSeconds === "number" &&
      policy.resolutionGraceSeconds > 0 &&
      Number.isSafeInteger(policy.resolutionGraceSeconds),
  );
  assert(q.resolveBy - q.releaseNotBefore === policy.resolutionGraceSeconds);
  assert(
    typeof policy.maxHoldSeconds === "number" &&
      Number.isSafeInteger(policy.maxHoldSeconds) &&
      policy.maxHoldSeconds > 0,
  );
  assert(
    q.resolveBy - (q.validUntil - document.quoteLifetimeSeconds) <= Number(policy.maxHoldSeconds),
  );
  assert(sameJson(input.arguments, document.effectiveArguments));
  assert(sameJson(input.context, document.contextManifest));
  assert(
    hashSnapshot(document.inputSnapshot) === q.inputHash && q.inputHash === document.inputHash,
  );
  assert(
    hashSnapshot(document.termsSnapshot) === q.termsHash && q.termsHash === document.termsHash,
  );
  assert(
    hashSnapshot(document.policySnapshot) === q.policyHash && q.policyHash === document.policyHash,
  );
  assert(hashQuote(vaultDomain(vault), q) === document.quoteDigest);
  return q;
}

export function paymentRequirements(document: QuoteDocument): PaymentRequirements {
  return {
    scheme: SCHEME,
    network: NETWORK,
    asset: document.asset,
    amount: document.grossAmount,
    payTo: document.vault,
    maxTimeoutSeconds: document.quoteLifetimeSeconds,
    extra: {
      schemeVersion: SCHEME_VERSION,
      paymentFlow: "upfront",
      vault: document.vault,
      invocationId: document.invocationId,
      quoteId: document.quoteId,
      quoteDigest: document.quoteDigest,
      quote: document.protocolQuote,
      // "authorization": the buyer's wallet signs a USDC ReceiveWithAuthorization
      // for this quote. "grant": a spending grant's signer signs a debit.
      funding: ["authorization", "grant"],
      eip3009: {
        primaryType: "ReceiveWithAuthorization",
        name: "USD Coin",
        version: "2",
        validAfter: "0",
        validBefore: String(document.validUntil),
        nonce: document.quoteDigest,
      },
    },
  };
}

// The USDC authorization the buyer's own wallet signs to pay one quote.
export function authorizationTypedData(document: QuoteDocument) {
  const vault = getAddress(document.vault);
  return receiveAuthorizationTypedData(
    getAddress(document.asset),
    vault,
    readQuote(document.protocolQuote),
    document.quoteDigest,
  );
}

// The EIP-712 debit the grant's signer signs to pay for one quote.
export function debitTypedData(document: QuoteDocument, grantId: Hex, grantEpoch: bigint) {
  return {
    domain: vaultDomain(getAddress(document.vault)),
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: { quoteDigest: document.quoteDigest, grantId, grantEpoch },
  } as const;
}

export type PaymentBody =
  | { kind: "authorization"; signature: Hex }
  | {
      kind: "grant";
      authorization: { quoteDigest: Hex; grantId: Hex; grantEpoch: string };
      signature: Hex;
    };

export function authorizationPayment(signature: Hex): PaymentBody {
  return { kind: "authorization", signature };
}

export function grantPayment(
  document: QuoteDocument,
  grantId: Hex,
  grantEpoch: bigint,
  signature: Hex,
): PaymentBody {
  return {
    kind: "grant",
    authorization: {
      quoteDigest: document.quoteDigest,
      grantId,
      grantEpoch: grantEpoch.toString(),
    },
    signature,
  };
}

// The x402 v2 payment, base64 of its JSON as the PAYMENT-SIGNATURE header
// carries it. All envelope values are ASCII.
export function paymentSignatureHeader(
  document: QuoteDocument,
  payload: PaymentBody,
  resourceUrl: string,
) {
  const envelope = {
    x402Version: 2,
    accepted: paymentRequirements(document),
    resource: { url: resourceUrl, method: "POST" },
    payload,
  };
  return btoa(JSON.stringify(envelope));
}

const SECP256K1_HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

function ecdsaSignature(signature: unknown): Hex {
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error("Invalid ECDSA signature");
  }
  const s = BigInt(`0x${signature.slice(66, 130)}`);
  const v = signature.slice(130).toLowerCase();
  if (s === 0n || s > SECP256K1_HALF_N || !["1b", "1c"].includes(v))
    throw new Error("Invalid ECDSA signature");
  return signature.toLowerCase() as Hex;
}

// A buyer signature may come from an EOA (65 bytes, canonical) or a contract
// wallet (ERC-1271/ERC-6492, any length up to a bound). Validity is checked
// against the chain, never here.
function buyerSignature(signature: unknown): Hex {
  if (typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{2}){65,4096}$/.test(signature)) {
    throw new Error("Invalid buyer signature");
  }
  return signature.length === 132 ? ecdsaSignature(signature) : (signature.toLowerCase() as Hex);
}

export type PaymentIntent = {
  mode: FundingMode;
  // The grant debit; null when the buyer's wallet authorized the payment itself.
  authorization: DebitAuthorization | null;
  signature: Hex;
  // The grant signer recovered from the debit, or the quote's buyer when the
  // buyer's wallet signed. Neither is trusted until the chain is checked.
  signer: Address;
  authorizationDigest: Hex;
  paymentPayload: PaymentPayload;
};

// Local envelope/signature integrity only. The recovered EOA is NOT trusted as
// the grant signer until the worker reads the grant and simulates reserveHold.
// `deploymentResource` is this deployment's /v1/invocations URL: the resource
// of v2 quotes, and the origin a v3 quote's own resource must share.
export async function readPaymentIntent(
  document: QuoteDocument,
  value: unknown,
  deploymentResource: string,
): Promise<PaymentIntent> {
  const q = validateQuoteDocument(
    document,
    getAddress(document.vault),
    getAddress(document.protocolQuote.buyer),
  );
  canonicalSnapshot(value as Json);
  const envelope = object(value as Json);
  keys(envelope, ["x402Version", "accepted", "resource", "payload"]);
  if (envelope.x402Version !== 2 || !sameJson(envelope.accepted, paymentRequirements(document))) {
    throw new Error("Invalid payment requirements");
  }
  const resource = object(envelope.resource);
  if (resource.url !== paymentResource(document, deploymentResource) || resource.method !== "POST")
    throw new Error("Invalid payment resource");
  const payload = object(envelope.payload);
  const vault = getAddress(document.vault);
  if (payload.kind === "authorization") {
    keys(payload, ["kind", "signature"]);
    return {
      mode: "authorization",
      authorization: null,
      signature: buyerSignature(payload.signature),
      signer: q.buyer,
      authorizationDigest: hashReceiveAuthorization(vault, q, document.quoteDigest),
      paymentPayload: structuredClone(value) as PaymentPayload,
    };
  }
  if (payload.kind !== "grant") throw new Error("Invalid payment kind");
  keys(payload, ["kind", "authorization", "signature"]);
  const wire = object(payload.authorization);
  keys(wire, ["quoteDigest", "grantId", "grantEpoch"]);
  if (
    wire.quoteDigest !== document.quoteDigest ||
    typeof wire.grantId !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(wire.grantId)
  )
    throw new Error("Invalid authorization");
  const epoch = integer(wire.grantEpoch, 64);
  if (epoch === 0n) throw new Error("Invalid grant epoch");
  const signature = ecdsaSignature(payload.signature);
  const authorization: DebitAuthorization = {
    quoteDigest: document.quoteDigest,
    grantId: wire.grantId.toLowerCase() as Hex,
    grantEpoch: epoch,
  };
  const domain = vaultDomain(vault);
  const signer = await recoverTypedDataAddress({
    domain,
    types: paymentTypes,
    primaryType: "DebitAuthorization",
    message: authorization,
    signature,
  });
  return {
    mode: "grant",
    authorization,
    signature,
    signer,
    authorizationDigest: hashAuthorization(domain, authorization),
    paymentPayload: structuredClone(value) as PaymentPayload,
  };
}

// Bound to one immutable quote: never use dynamicExtraFields for economic data.
export class VaultServerScheme implements SchemeNetworkServer {
  readonly scheme = SCHEME;
  readonly defaultAssetTransferMethod = "default";
  readonly paymentFlows = { default: { supported: ["upfront"], default: "upfront" } } as const;
  constructor(private readonly document: QuoteDocument) {
    this.document = structuredClone(document);
    validateQuoteDocument(
      this.document,
      getAddress(document.vault),
      getAddress(document.protocolQuote.buyer),
    );
  }

  async parsePrice(price: Price, network: Network): Promise<AssetAmount> {
    if (
      network !== NETWORK ||
      typeof price !== "object" ||
      !sameJson(price, { amount: this.document.grossAmount, asset: this.document.asset })
    )
      throw new Error("Only persisted atomic quote prices are supported");
    return { amount: this.document.grossAmount, asset: this.document.asset };
  }

  validateFacilitatorSupport(network: Network, kind: SupportedKind): string | void {
    if (
      network !== NETWORK ||
      kind.network !== NETWORK ||
      kind.x402Version !== 2 ||
      kind.scheme !== SCHEME ||
      kind.extra?.schemeVersion !== SCHEME_VERSION ||
      !sameAddress(kind.extra?.vault, this.document.vault)
    )
      return "Payvoke facilitator capability mismatch";
  }

  async enhancePaymentRequirements(requirements: PaymentRequirements, kind: SupportedKind) {
    if (this.validateFacilitatorSupport(NETWORK, kind)) throw new Error("Unsupported facilitator");
    const expected = paymentRequirements(this.document);
    if (!sameJson(requirements, expected)) throw new Error("QUOTE_INCONSISTENT");
    return structuredClone(expected);
  }
}

export type AuthorizationRecord = {
  invocationId: string;
  quoteId: string;
  quoteDigest: Hex;
  payload: PaymentBody;
};

// Anything that signs EIP-712 for an address: a viem LocalAccount, a browser
// wallet or an MCP token's grant key.
export type PaymentSigner = {
  address: Address;
  signTypedData(args: TypedDataDefinition): Promise<Hex>;
};

// How the client pays: its signer is the buyer's own wallet, or a grant signer.
export type ClientFunding =
  | { mode: "authorization" }
  | { mode: "grant"; grantId: Hex; grantEpoch: bigint };

// The caller validates the immutable inputSchema hash and spending policy, and
// supplies trusted buyer/vault/resource identity; none is inferred from a 402.
export class VaultClientScheme implements SchemeNetworkClient {
  readonly scheme = SCHEME;
  readonly schemeHooks: SchemeClientHooks;
  readonly findDefaultAsset = (asset: string, network: Network) =>
    network === NETWORK && asset.toLowerCase() === ASSET.toLowerCase()
      ? { asset: ASSET, decimals: 6, symbol: "USDC" }
      : undefined;
  constructor(
    private readonly options: {
      document: QuoteDocument;
      buyer: Address;
      vault: Address;
      resourceUrl: string;
      signer: PaymentSigner;
      funding: ClientFunding;
      maxAmount: bigint;
      persist: (record: AuthorizationRecord) => Promise<void>;
      now?: () => number;
    },
  ) {
    this.options = { ...options, document: structuredClone(options.document) };
    // A v3 quote names the one URL it is paid at; a v2 quote is paid at
    // /v1/invocations. Either way the caller's trusted URL must match.
    const own = quoteResource(options.document);
    if (
      !validResourceUrl(options.resourceUrl) ||
      (own === null
        ? new URL(options.resourceUrl).pathname !== "/v1/invocations"
        : own !== options.resourceUrl)
    )
      throw new Error("Invalid invocation resource");
    const resource = new URL(options.resourceUrl);
    this.schemeHooks = {
      onBeforePaymentCreation: async ({ paymentRequired }) => {
        if (paymentRequired.resource?.url !== resource.href) {
          return { abort: true, reason: "Untrusted payment resource" };
        }
        if (!("method" in paymentRequired.resource) || paymentRequired.resource.method !== "POST") {
          return { abort: true, reason: "Invalid payment resource method" };
        }
      },
    };
  }

  async createPaymentPayload(
    version: number,
    requirements: PaymentRequirements,
    context?: PaymentPayloadContext,
  ) {
    const o = this.options;
    const q = validateQuoteDocument(o.document, o.vault, o.buyer);
    if (version !== 2 || !sameJson(requirements, paymentRequirements(o.document))) {
      throw new Error("Payment requirements do not match approved quote");
    }
    if (q.validUntil <= (o.now?.() ?? Math.floor(Date.now() / 1000)))
      throw new Error("Quote expired");
    if (
      q.grossAmount > o.maxAmount ||
      (context?.maxAmountPerPayment !== undefined &&
        q.grossAmount > integer(context.maxAmountPerPayment, 256))
    )
      throw new Error("Spend cap exceeded");
    let payload: PaymentBody;
    if (o.funding.mode === "authorization") {
      if (getAddress(o.signer.address) !== q.buyer) throw new Error("Signer is not the buyer");
      payload = authorizationPayment(
        await o.signer.signTypedData(authorizationTypedData(o.document)),
      );
    } else {
      const { grantId, grantEpoch } = o.funding;
      if (
        !isHex(grantId, { strict: true }) ||
        grantId.length !== 66 ||
        grantEpoch <= 0n ||
        grantEpoch >= 1n << 64n
      )
        throw new Error("Invalid grant");
      const signature = await o.signer.signTypedData(
        debitTypedData(o.document, grantId, grantEpoch),
      );
      payload = grantPayment(o.document, grantId, grantEpoch, signature);
    }
    await o.persist({
      invocationId: o.document.invocationId,
      quoteId: o.document.quoteId,
      quoteDigest: o.document.quoteDigest,
      payload,
    });
    return { x402Version: 2, payload };
  }
}
