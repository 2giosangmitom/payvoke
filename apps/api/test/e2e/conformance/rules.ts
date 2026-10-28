// x402 conformance manifest. Each rule from the 2026 x402 security research names
// the existing negative tests that prove it. `bun run test:conformance` fails when
// a rule has no passing test or when a listed test is renamed, skipped or missing,
// so coverage cannot pass silently.

export type Suite = "backend" | "protocol" | "vault";
export type Evidence = { suite: Suite; test: string };
export type Rule = {
  id: string;
  source: string;
  requirement: string;
  evidence: Evidence[];
  // Out of the payment scope; reported explicitly, never counted as passing.
  deferred?: string;
};

const backend = (test: string): Evidence => ({ suite: "backend", test });
const protocol = (test: string): Evidence => ({ suite: "protocol", test });
const vault = (test: string): Evidence => ({ suite: "vault", test });

export const rules: Rule[] = [
  {
    id: "SR1",
    source: "P1",
    requirement: "Payment proof must match the requirements the server persisted",
    evidence: [
      backend(
        "client rejects altered economics, snapshots, resource, expiry and spend caps before persistence",
      ),
      backend("rejects altered envelopes and cross-buyer intents without persisting"),
    ],
  },
  {
    id: "SR2",
    source: "P1, P4 P18",
    requirement: "Only the grant's session signer can authorize a hold",
    evidence: [vault("test_WrongSigner()"), vault("test_MalformedSignature()")],
  },
  {
    id: "SR3",
    source: "P1, P4 P17",
    requirement: "Expired or revoked authorizations never reserve a hold",
    evidence: [
      vault("test_ExpiredQuoteAtExactDeadline()"),
      vault("test_ExpiredGrantAtExactDeadline()"),
      vault("test_RevokeBeforeReserveWins()"),
      backend("expires unpaid quotes without extending deadlines on replay"),
    ],
  },
  {
    id: "SR4",
    source: "P1, P3 M4, P4 P5",
    requirement: "Report success only after the hold is finalized onchain",
    evidence: [
      backend(
        "does not queue before finality, then handles a pre-finality reorg without replacing the transaction",
      ),
      backend(
        "serves x402 core in-process and maps errors without manufacturing a transaction hash",
      ),
      backend("records finalized revert and spent gas, never a ready event or second attempt"),
    ],
  },
  {
    id: "SR5",
    source: "P1, P6",
    requirement: "Fail fast on payments that cannot settle or do not cover sponsored gas",
    evidence: [
      backend("enforces the approved price floor and defaults the evidence floor in signed terms"),
      backend("rejects invalid args, selected unresolved context and unavailable products"),
      vault("test_ZeroAmount()"),
    ],
  },
  {
    id: "SR6",
    source: "P1, P4 P13",
    requirement: "Bound sponsored gas per transaction and over a rolling budget",
    evidence: [
      backend("fails closed on fee/gas/balance/nonce limits before signing"),
      backend(
        "accounts finalized gas against the durable rolling budget before the next signature",
      ),
    ],
  },
  {
    id: "SR7",
    source: "P1",
    requirement: "Settle revalidates everything instead of trusting an earlier verify",
    evidence: [
      backend(
        "verifies through the SDK facilitator without any journal side effects; settle revalidates",
      ),
      vault("rechecks revocation on the real chain rather than trusting an earlier valid preview"),
    ],
  },
  {
    id: "SR8",
    source: "P1",
    requirement: "Only allowlisted reserveHold calldata on the configured vault is signed",
    evidence: [
      backend(
        "rejects signed transactions for a different chain, calldata, destination, nonce, value or fees",
      ),
    ],
  },
  {
    id: "F1",
    source: "P2 I3, P3 M3",
    requirement: "A signature cannot pay for another invocation, quote or resource",
    evidence: [
      protocol("every quote field and domain binds consent"),
      vault("test_ChangedQuoteCannotChargeSameInvocation()"),
      vault("test_SignatureCannotAuthorizeChangedAmount()"),
      vault("rejects signatures for another chain or another vault"),
    ],
  },
  {
    id: "F2",
    source: "P2 I4, P4 P3",
    requirement: "Concurrent or replayed submissions settle at most one hold",
    evidence: [
      backend("journals one immutable intent and invocation under duplicate admission"),
      backend(
        "settles a durable intent once, commits HELD + ready atomically, and replays the receipt",
      ),
      vault("test_ReplayAfterExpiryRevocationAndPauseReturnsSameHold()"),
    ],
  },
  {
    id: "F3",
    source: "P2 I2, P4 P8",
    requirement: "Grant caps cannot be overdrawn",
    evidence: [
      vault("test_PerCallCap()"),
      vault("test_PeriodBoundaryAndLifetimeCap()"),
      vault("testFuzz_AdmissionSequenceStopsAtPeriodCap(uint8)"),
      backend(
        "accepts exact spending boundaries and rejects one atomic unit over the remaining cap",
      ),
    ],
  },
  {
    id: "F4",
    source: "P2 I1/I5",
    requirement: "No provider work is dispatched before funds are held",
    evidence: [
      backend("records a late/closed hold as paid but never queues an expired delivery"),
      vault("test_WithdrawBeforeReserveWins()"),
    ],
  },
  {
    id: "M1",
    source: "P3, P4 P1/P9",
    requirement: "Canonical typed encoding (EIP-712 + JCS) and strict integers",
    evidence: [
      protocol("matches published EIP-712 hashes, signature and recovered session signer"),
      protocol("JCS sorts keys, keeps array order, null, Unicode and ECMAScript numbers"),
      protocol("invalid JSON values are rejected rather than silently omitted or transformed"),
      backend("rejects noncanonical and overflowing on-wire integers"),
    ],
  },
  {
    id: "M2",
    source: "P3",
    requirement: "Only the authorized facilitator/relayer can settle a leaked header",
    evidence: [
      vault("test_OnlyRelayerCanReserve()"),
      backend("exposes no facilitator endpoint over HTTP; only the in-process gateway settles"),
    ],
  },
  {
    id: "M3",
    source: "P3",
    requirement: "Authorizations are single-use and bound to the buyer's own quote",
    evidence: [
      vault("test_NewGrantCannotChargeExistingInvocation()"),
      backend("conflicts on a different authorization for the same invocation"),
      backend("enforces session ownership, suspension, Origin and idempotency before admission"),
    ],
  },
  {
    id: "M4",
    source: "P3",
    requirement: "Deliver only after reserve and finality (two-phase)",
    evidence: [
      backend(
        "settles a durable intent once, commits HELD + ready atomically, and replays the receipt",
      ),
    ],
  },
  {
    id: "M5",
    source: "P3, P4 P16",
    requirement: "Payment responses are no-store and payment headers are never logged",
    evidence: [
      backend("keeps payment metadata uncacheable and free of prompts, PII and signatures"),
    ],
  },
  {
    id: "M6",
    source: "P3",
    requirement: "Discovery resists steering by fake metadata, Sybil providers and injection",
    evidence: [],
    deferred: "Store ranking is outside the payment scope",
  },
  {
    id: "PII",
    source: "P5",
    requirement: "Payment metadata carries only opaque IDs, hashes and a fixed description",
    evidence: [
      backend("keeps payment metadata uncacheable and free of prompts, PII and signatures"),
    ],
  },
];
