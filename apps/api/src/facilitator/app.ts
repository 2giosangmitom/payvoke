import fastify, { LogController } from "fastify";
import bearerAuth from "@fastify/bearer-auth";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { x402Facilitator } from "@x402/core/facilitator";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import { NETWORK, SCHEME } from "@payvoke/shared/x402";
import { VaultFacilitatorScheme, VaultValidationError } from "@payvoke/shared/x402/facilitator";
import { createPublicClient, getAddress, http, zeroAddress } from "viem";
import { logRedaction, parseFinancialJson, vaultDeployment } from "@/core/runtime";
import { createDatabase, type PrismaClient } from "@/core/db";
import { MemoryJobs, type Jobs } from "@/core/queue";
import { VaultChain } from "@payvoke/shared/x402/chain";
import type { FacilitatorConfig } from "./config";
import { createPaymentValidator } from "@/core/payments/validation";
import { createSettlementService } from "@/core/payments/settlement";
import { SettlementError } from "@/core/payments/journal";

type PaymentBody = {
  x402Version: 2;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
};
const bodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["x402Version", "paymentPayload", "paymentRequirements"],
  properties: {
    x402Version: { const: 2, type: "integer" },
    paymentPayload: {
      type: "object",
      additionalProperties: false,
      required: ["x402Version", "payload", "accepted", "resource"],
      properties: {
        x402Version: { const: 2, type: "integer" },
        payload: { type: "object" },
        accepted: { type: "object" },
        resource: { type: "object" },
      },
    },
    paymentRequirements: {
      type: "object",
      required: ["scheme", "network", "extra"],
      properties: {
        scheme: { const: SCHEME, type: "string" },
        network: { const: NETWORK, type: "string" },
        extra: { type: "object" },
      },
    },
  },
};

export function createFacilitatorApp(
  config: FacilitatorConfig,
  database?: PrismaClient,
  reader?: VaultChain,
  // Wakes the settlement worker; tests and tools default to recording calls.
  jobs: Jobs = new MemoryJobs(),
) {
  if (Buffer.byteLength(config.FACILITATOR_TOKEN) < 32)
    throw new VaultValidationError("invalid_facilitator_policy", 503);
  const deployment = vaultDeployment(config);
  const db = database ?? createDatabase(config.DATABASE_URL);
  const chain =
    reader ??
    new VaultChain(
      createPublicClient({
        transport: http(config.RPC_URL, { retryCount: 0, timeout: 10000 }),
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
  const app = fastify({
    bodyLimit: 8192,
    requestTimeout: 15000,
    connectionTimeout: 15000,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
    logger: { level: config.LOG_LEVEL, redact: logRedaction },
    logController: new LogController({ disableRequestLogging: true }),
  });
  app.addHook("onClose", async () => {
    await db.$disconnect();
  });
  app.register(async (scope) => {
    await scope.register(sensible);
    await scope.register(helmet);
    scope.addHook("onRequest", async (_request, reply) => {
      reply.cacheControl("no-store");
    });
    await scope.register(bearerAuth, {
      keys: new Set([config.FACILITATOR_TOKEN]),
      addHook: "onRequest",
      verifyErrorLogLevel: "silent",
      errorResponse: () => ({ error: "unauthorized" }),
    });
    await scope.register(rateLimit, { global: true, max: 60, timeWindow: "1 minute" });
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (_request, text, done) => {
        try {
          done(null, parseFinancialJson(text as string));
        } catch {
          done(scope.httpErrors.badRequest("invalid_json"));
        }
      },
    );
    scope.setErrorHandler((error, _request, reply) => {
      if (error instanceof VaultValidationError)
        return reply.code(error.statusCode).send({ error: error.code });
      if (error instanceof SettlementError)
        return reply.code(error.statusCode).send({ error: error.code.toLowerCase() });
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      if (status >= 500) scope.log.error("Facilitator request failed");
      return reply
        .code(status)
        .send({ error: status >= 500 ? "internal_error" : "invalid_request" });
    });
    scope.addHook("onReady", async () => {
      // In execution mode, role loss blocks new admission but must not make
      // already-paid receipts unavailable after a facilitator restart.
      await chain.initialize({ requireRelayerRole: !config.SETTLEMENT_ENABLED });
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
    });
    const validate = createPaymentValidator(
      db,
      chain,
      new URL("/v1/invocations", config.API_ORIGIN).href,
    );
    const facilitator = new x402Facilitator().register(
      NETWORK,
      new VaultFacilitatorScheme({
        vault: deployment.vault,
        relayer: deployment.relayer,
        validate,
        settle: config.SETTLEMENT_ENABLED
          ? createSettlementService(
              db,
              chain,
              new URL("/v1/invocations", config.API_ORIGIN).href,
              (invocationId) => jobs.settle(invocationId),
            )
          : undefined,
      }),
    );
    scope.get("/supported", async () => facilitator.getSupported());
    for (const operation of ["verify", "settle"] as const) {
      scope.post<{ Body: PaymentBody }>(
        `/${operation}`,
        { schema: { body: bodySchema } },
        async (request) => {
          return facilitator[operation](
            request.body.paymentPayload,
            request.body.paymentRequirements,
          );
        },
      );
    }
  });
  return app;
}
