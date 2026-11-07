import { getAddress, type Address, type Hex } from "viem";
import {
  grantRevokeTypedData,
  grantSetupTypedData,
  NO_PERMIT,
  type VaultPermit,
} from "@payvoke/shared/protocol";
import type { Cradle } from "../../container";
import type { Prisma } from "#core/db";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableEntityError,
} from "../../errors";
import type { GrantCall } from "./autopay.service";

type WirePermit = { value: string; deadline: string; signature: string };
export type GrantOperationRequest =
  | {
      kind: "set";
      buyer: string;
      grantId: string;
      config: {
        signer: string;
        expiresAt: number;
        maxPerCall: string;
        periodSeconds: number;
        maxPerPeriod: string;
        maxTotal: string;
      };
      deadline: number;
      signature: string;
      permit?: WirePermit;
    }
  | {
      kind: "revoke";
      buyer: string;
      grantId: string;
      deadline: number;
      signature: string;
      permit?: WirePermit;
    };

// States the relayer still owns: one per buyer at a time, since every grant
// signature carries the buyer's next vault nonce.
export const ACTIVE_GRANT_OPERATION_STATES = ["PENDING", "SIGNED", "BROADCAST", "UNKNOWN"] as const;

const permitOf = (permit?: WirePermit): VaultPermit =>
  permit
    ? {
        value: BigInt(permit.value),
        deadline: BigInt(permit.deadline),
        signature: permit.signature as Hex,
      }
    : NO_PERMIT;

// The relayed call a stored request stands for. The worker rebuilds the
// transaction from this, never from anything else the client sent.
export function grantCall(request: GrantOperationRequest): GrantCall {
  const buyer = getAddress(request.buyer);
  const grantId = request.grantId.toLowerCase() as Hex;
  const permit = permitOf(request.permit);
  if (request.kind === "revoke")
    return {
      functionName: "revokeGrantWithSig",
      args: [buyer, grantId, request.deadline, request.signature as Hex, permit],
    };
  const c = request.config;
  return {
    functionName: "setGrantWithSig",
    args: [
      buyer,
      grantId,
      {
        signer: getAddress(c.signer),
        expiresAt: c.expiresAt,
        maxPerCall: BigInt(c.maxPerCall),
        periodSeconds: c.periodSeconds,
        maxPerPeriod: BigInt(c.maxPerPeriod),
        maxTotal: BigInt(c.maxTotal),
      },
      request.deadline,
      request.signature as Hex,
      permit,
    ],
  };
}

type Row = Awaited<ReturnType<Cradle["db"]["grantOperation"]["findUniqueOrThrow"]>>;
const view = (row: Row) => ({
  id: row.id,
  kind: row.kind === "SET" ? "set" : "revoke",
  buyer: row.buyer,
  grantId: row.grantId,
  state: row.state,
  errorReason: row.errorReason,
  transactionHash: row.transactionHash,
  createdAt: row.createdAt,
  finalizedAt: row.finalizedAt,
});

// Buyer-signed grant changes the relayer submits, so creating, changing or
// revoking a grant costs the buyer no gas. Each is checked against the chain
// here (signature, nonce, a simulation from the relayer) before it is queued.
export class GrantOperationService {
  private readonly db: Cradle["db"];
  private readonly reader: Cradle["grantReader"];
  private readonly grants: Cradle["grantService"];
  private readonly config: Cradle["config"];

  constructor({ db, grantReader, grantService, config }: Cradle) {
    this.db = db;
    this.reader = grantReader;
    this.grants = grantService;
    this.config = config;
  }

  async create(userId: string, request: GrantOperationRequest) {
    const reader = this.reader;
    if (!reader || !this.config.VAULT_ADDRESS || !this.config.RELAYER_ADDRESS)
      throw new ServiceUnavailableError("PAYMENTS_UNAVAILABLE");
    const vault = getAddress(this.config.VAULT_ADDRESS);
    const buyer: Address = getAddress(request.buyer);
    await this.grants.admit(userId, buyer, request.kind === "revoke");
    const pending = await this.db.grantOperation.findFirst({
      where: { buyer: buyer.toLowerCase(), state: { in: [...ACTIVE_GRANT_OPERATION_STATES] } },
    });
    if (pending) throw new ConflictError("GRANT_OPERATION_PENDING");
    const call = grantCall(request);
    let nonce: bigint;
    try {
      nonce = await reader.nonce(buyer);
    } catch {
      throw new ServiceUnavailableError("CHAIN_UNAVAILABLE");
    }
    const grantId = request.grantId.toLowerCase() as Hex;
    const typed =
      call.functionName === "setGrantWithSig"
        ? grantSetupTypedData(vault, {
            buyer,
            grantId,
            ...call.args[2],
            nonce,
            deadline: request.deadline,
          })
        : grantRevokeTypedData(vault, { buyer, grantId, nonce, deadline: request.deadline });
    if (!(await reader.verify({ ...typed, address: buyer, signature: request.signature as Hex })))
      throw new BadRequestError("INVALID_GRANT_SIGNATURE");
    let revert: string | null;
    try {
      revert = await reader.simulate(call);
    } catch {
      throw new ServiceUnavailableError("CHAIN_UNAVAILABLE");
    }
    if (revert)
      throw new UnprocessableEntityError(
        `GRANT_${revert.replace(/[A-Z]/g, (c, i) => (i ? "_" : "") + c).toUpperCase()}`,
      );
    const row = await this.db.grantOperation.create({
      data: {
        userId,
        buyer: buyer.toLowerCase(),
        grantId,
        kind: request.kind === "set" ? "SET" : "REVOKE",
        request: request as unknown as Prisma.InputJsonValue,
      },
    });
    return view(row);
  }

  async get(userId: string, id: string) {
    const row = await this.db.grantOperation.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundError("GRANT_OPERATION_NOT_FOUND");
    return view(row);
  }
}
