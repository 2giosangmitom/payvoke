import "dotenv/config";
import { createPublicClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  broadcastOperation,
  deployment,
  integer,
  loadJson,
  operationReceipt,
  preflight,
  prepareOperation,
  saveExclusive,
  type Action,
  type Ceremony,
  type SignedOperation,
} from "./fuji";
import {
  paymentSession,
  pollPayment,
  preparePayment,
  submitPayment,
  verifyPayment,
  type PaymentRun,
  type PreparedPayment,
} from "./payment";
import { journalEvidence, localSeedDatabase, seedCeremony, type Seed } from "./seed";
import { createDatabase } from "@payvoke/db";
import { isSafeServiceUrl } from "@payvoke/server";
import {
  FinanceService,
  parseDecision,
  recordPaymentDelivery,
  type FinanceApproval,
} from "../modules/payments/finance";
import { scanFinancialLifecycle } from "../modules/payments/finance-ledger";
import { SettlementChain } from "@payvoke/x402/settlement";
import { hashDecision, paymentTypes, vaultDomain } from "@payvoke/protocol";
import type { Address } from "viem";
import type { GasPolicy } from "../modules/payments/journal";

type FinanceRun = {
  ceremony: Ceremony;
  executor: Address;
  approval: FinanceApproval;
  decisionId: Hex;
  gasBudget: { [K in keyof GasPolicy]: GasPolicy[K] extends bigint ? string : number };
  delivery: Parameters<typeof recordPaymentDelivery>[1];
};

// No command combines preparation, broadcast, and receipt collection. An operator
// must approve the concrete hash/digest between those steps.
const [command, input, output] = process.argv.slice(2);
const print = (value: unknown) =>
  console.log(JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
const signer = (name: string) => {
  const key = process.env[name];
  if (!key || !/^0x[\da-fA-F]{64}$/.test(key)) throw new Error("Missing signer");
  return privateKeyToAccount(key as Hex);
};
try {
  if (!input) throw new Error("Input file required");
  if (
    [
      "preflight",
      "prepare",
      "broadcast",
      "receipt",
      "payment-check",
      "finance-approve",
      "finance-enqueue",
      "finance-tick",
      "finance-sync",
      "finance-status",
      "finance-delivery",
    ].includes(command)
  ) {
    const rpc = new URL(process.env.RPC_URL ?? "");
    if (!isSafeServiceUrl(rpc)) throw new Error("Unsafe RPC URL");
    const client = createPublicClient({
      transport: http(rpc.href, { timeout: 10000, retryCount: 0 }),
    });
    if (command.startsWith("finance-")) {
      const run = await loadJson<FinanceRun>(input);
      await preflight(client, run.ceremony);
      if (command === "finance-approve") {
        if (!output) throw new Error("Exclusive approval output required");
        if (process.env.FINANCE_EXECUTOR_PRIVATE_KEY)
          throw new Error("Approver and executor keys must be separate processes");
        const account = signer("APPROVER_PRIVATE_KEY");
        const decision = parseDecision(run.approval.decision);
        const signature = await account.signTypedData({
          domain: vaultDomain(run.ceremony.vault!),
          types: paymentTypes,
          primaryType: "ResolutionDecision",
          message: decision,
        });
        const approval = { ...run.approval, approver: account.address, signature };
        await saveExclusive(output, { ...run, approval });
        print({
          decisionId: decision.decisionId,
          digest: hashDecision(vaultDomain(run.ceremony.vault!), decision),
          approver: account.address,
        });
      } else {
        const db = createDatabase(localSeedDatabase(process.env.CEREMONY_DATABASE_URL ?? ""));
        try {
          const chain = new SettlementChain(client, deployment(run.ceremony));
          if (command === "finance-sync") {
            if (!run.ceremony.deploymentBlock) throw new Error("Deployment start block required");
            print(await scanFinancialLifecycle(db, chain, integer(run.ceremony.deploymentBlock)));
          } else if (command === "finance-delivery") {
            if (process.env.MANUAL_DELIVERY_ATTESTATION_ENABLED !== "true")
              throw new Error("Trusted delivery attestation disabled");
            print(await recordPaymentDelivery(db, run.delivery));
          } else if (command === "finance-status") {
            const row = await db.financeDecision.findUniqueOrThrow({
              where: { id: run.decisionId },
            });
            print({
              decisionId: row.id,
              state: row.state,
              transactionHash: row.transactionHash,
              errorReason: row.errorReason,
              receipt: row.receipt,
              actualGasCostWei: row.actualGasCost?.toFixed(0) ?? null,
            });
          } else {
            const budget = Object.fromEntries(
              Object.entries(run.gasBudget).map(([key, value]) => [
                key,
                typeof value === "string" ? integer(value) : value,
              ]),
            ) as GasPolicy;
            const service = new FinanceService(db, chain, run.executor, budget);
            if (command === "finance-enqueue") {
              const row = await service.enqueue(run.approval);
              print({ decisionId: row.id, state: row.state, digest: row.digest });
            } else {
              if (
                process.env.FUJI_BROADCAST_ENABLED !== "true" ||
                process.env.FINANCE_EXECUTION_ENABLED !== "true"
              )
                throw new Error("Finance execution disabled");
              if (process.env.APPROVER_PRIVATE_KEY)
                throw new Error("Approver key must not be present in executor process");
              print({
                processed: await service.tick(
                  run.decisionId,
                  signer("FINANCE_EXECUTOR_PRIVATE_KEY"),
                ),
              });
            }
          }
        } finally {
          await db.$disconnect();
        }
      }
    } else if (command === "preflight")
      print(await preflight(client, await loadJson<Ceremony>(input)));
    else if (command === "prepare") {
      if (!output) throw new Error("Exclusive output file required");
      const { ceremony, action } = await loadJson<{ ceremony: Ceremony; action: Action }>(input);
      print(
        await prepareOperation(client, ceremony, action, signer("OPERATOR_PRIVATE_KEY"), output),
      );
    } else if (command === "broadcast") {
      if (process.env.FUJI_BROADCAST_ENABLED !== "true") throw new Error("Broadcast disabled");
      print(
        await broadcastOperation(client, await loadJson<SignedOperation>(input), input, output),
      );
    } else if (command === "payment-check") {
      if (!output) throw new Error("Exclusive evidence file required");
      const { ceremony, prepared, transactionHash } = await loadJson<{
        ceremony: Ceremony;
        prepared: PreparedPayment;
        transactionHash: Hex;
      }>(input);
      const result = await verifyPayment(client, ceremony, prepared, transactionHash);
      await saveExclusive(output, result);
      print(result);
    } else {
      const result = await operationReceipt(client, await loadJson<SignedOperation>(input));
      if (!output) throw new Error("Exclusive receipt evidence file required");
      await saveExclusive(output, result);
      print(result);
    }
  } else if (command === "seed" || command === "journal-check") {
    const db = createDatabase(localSeedDatabase(process.env.CEREMONY_DATABASE_URL ?? ""));
    try {
      if (command === "seed") print(await seedCeremony(db, await loadJson<Seed>(input)));
      else {
        if (!output) throw new Error("Exclusive evidence file required");
        const { prepared, transactionHash } = await loadJson<{
          prepared: PreparedPayment;
          transactionHash: Hex;
        }>(input);
        const result = await journalEvidence(db, prepared, transactionHash);
        await saveExclusive(output, result);
        print(result);
      }
    } finally {
      await db.$disconnect();
    }
  } else if (["login", "payment-prepare", "payment-submit", "payment-poll"].includes(command)) {
    const prepared = ["login", "payment-prepare"].includes(command)
      ? undefined
      : await loadJson<PreparedPayment>(input);
    const run = prepared?.run ?? (await loadJson<PaymentRun>(input));
    const session = await paymentSession(run, signer("BUYER_PRIVATE_KEY"));
    try {
      if (command === "login") {
        const response = await session.request("/v1/me");
        if (!response.ok) throw new Error("Buyer identity unavailable");
        const identity = await response.json();
        print({ buyer: identity.buyer });
      } else if (command === "payment-prepare") {
        if (!output) throw new Error("Exclusive output file required");
        print(await preparePayment(session, run, signer("GRANT_PRIVATE_KEY"), output));
      } else if (command === "payment-submit") {
        if (process.env.FUJI_BROADCAST_ENABLED !== "true") throw new Error("Submission disabled");
        print(await submitPayment(session, prepared!, output));
      } else {
        if (!output) throw new Error("Exclusive evidence file required");
        const result = await pollPayment(session, prepared!);
        await saveExclusive(output, result);
        print(result);
      }
    } finally {
      await session.close();
    }
  } else throw new Error("Unknown command");
} catch {
  // RPC URLs, signed bytes, cookies and private keys must not enter error logs.
  console.error(
    "Operation failed; check inputs/policy. If send was attempted, reconcile the persisted hash before any further action.",
  );
  process.exitCode = 1;
}
