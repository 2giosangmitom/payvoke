import { x402Facilitator } from "@x402/core/facilitator";
import type { FacilitatorClient } from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements, SupportedResponse } from "@x402/core/types";
import { createPublicClient, getAddress, http, zeroAddress } from "viem";
import { NETWORK, SCHEME } from "@payvoke/shared/x402";
import { VaultChain } from "@payvoke/shared/x402/chain";
import { VaultFacilitatorScheme, VaultValidationError } from "@payvoke/shared/x402/facilitator";
import type { PrismaClient } from "#core/db";
import type { Jobs } from "#core/queue";
import { type DeploymentEnv, vaultDeployment } from "#core/runtime";
import { createSettlementService } from "#core/payments/settlement";
import { createPaymentValidator } from "#core/payments/validation";

export type FacilitatorOptions = DeploymentEnv & { SETTLEMENT_ENABLED: boolean };

export type Facilitator = FacilitatorClient & {
  // Checks the vault and the approved deployment policy; call before serving.
  ready(): Promise<void>;
};

// The payloads cross this boundary as JSON, exactly as they did over HTTP, so
// nothing the API holds by reference reaches the scheme.
const wire = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? `${item}` : item)));

const record = (value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// The request shape the HTTP facilitator enforced before the scheme sees it.
function request(payload: PaymentPayload, requirements: PaymentRequirements) {
  const body = wire({ payload, requirements });
  const p = body.payload as unknown as Record<string, unknown>;
  const r = body.requirements as unknown as Record<string, unknown>;
  if (
    !record(p) ||
    p.x402Version !== 2 ||
    Object.keys(p).some(
      (key) => !["x402Version", "payload", "accepted", "resource"].includes(key),
    ) ||
    !record(p.payload) ||
    !record(p.accepted) ||
    !record(p.resource) ||
    !record(r) ||
    r.scheme !== SCHEME ||
    r.network !== NETWORK ||
    !record(r.extra)
  )
    throw new VaultValidationError("invalid_request", 400);
  return body;
}

// x402 facilitator for the payvoke-escrow scheme, called in-process by the
// payment gateway. It verifies payments and, with SETTLEMENT_ENABLED, journals
// a settlement intent for the settlement worker. It holds no signing key.
export function createFacilitator(
  options: FacilitatorOptions,
  db: PrismaClient,
  // Wakes the settlement worker once an intent is journaled.
  jobs: Jobs,
  reader?: VaultChain,
): Facilitator {
  const deployment = vaultDeployment(options);
  const chain =
    reader ??
    new VaultChain(
      createPublicClient({
        // Admission only reads and simulates, so retrying a rate-limited,
        // timed-out or 5xx answer is safe; viem never retries a revert.
        transport: http(options.RPC_URL, { retryCount: 2, retryDelay: 400, timeout: 10000 }),
      }),
      deployment,
    );
  // Test injection cannot accidentally advertise a different configured vault.
  if (
    chain.deployment.chainId !== deployment.chainId ||
    getAddress(chain.deployment.vault) !== deployment.vault ||
    getAddress(chain.deployment.asset) !== deployment.asset ||
    getAddress(chain.deployment.relayer) !== deployment.relayer
  ) {
    throw new VaultValidationError("deployment_mismatch", 503);
  }
  const resource = new URL("/v1/invocations", options.API_ORIGIN).href;
  const facilitator = new x402Facilitator().register(
    NETWORK,
    new VaultFacilitatorScheme({
      vault: deployment.vault,
      relayer: deployment.relayer,
      validate: createPaymentValidator(db, chain, resource),
      settle: options.SETTLEMENT_ENABLED
        ? createSettlementService(db, chain, resource, (invocationId) => jobs.settle(invocationId))
        : undefined,
    }),
  );

  return {
    async ready() {
      // In execution mode, role loss blocks new admission but must not make
      // already-paid receipts unavailable after a restart.
      await chain.initialize({ requireRelayerRole: !options.SETTLEMENT_ENABLED });
      const policy = await db.deploymentPolicy.findUnique({ where: { activeSlot: "active" } });
      if (
        !policy ||
        getAddress(policy.vault) !== deployment.vault ||
        policy.feeBps < 0 ||
        policy.feeBps > deployment.feeCapBps ||
        policy.quoteLifetimeSeconds <= 0 ||
        policy.quoteLifetimeSeconds > deployment.maxQuoteLifetimeSeconds ||
        policy.maxHoldSeconds <= policy.quoteLifetimeSeconds + policy.resolutionGraceSeconds ||
        policy.maxHoldSeconds > deployment.maxHoldSeconds ||
        policy.resolutionGraceSeconds <= 0 ||
        !policy.minGrossAmount.greaterThan(0) ||
        getAddress(policy.feeRecipient) === zeroAddress
      ) {
        throw new VaultValidationError("deployment_policy_mismatch", 503);
      }
    },
    // The scheme registers the eip155 network, so every kind has a CAIP-2 id.
    getSupported: async () => facilitator.getSupported() as SupportedResponse,
    verify: async (payload: PaymentPayload, requirements: PaymentRequirements) => {
      const body = request(payload, requirements);
      return facilitator.verify(body.payload, body.requirements);
    },
    settle: async (payload: PaymentPayload, requirements: PaymentRequirements) => {
      const body = request(payload, requirements);
      return facilitator.settle(body.payload, body.requirements);
    },
  };
}
