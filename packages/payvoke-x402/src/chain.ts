import {
  hashAuthorization,
  hashQuote,
  paymentTypes,
  vaultAdmissionAbi,
  vaultDomain,
  type DebitAuthorization,
  type InvocationQuote,
} from "@payvoke/protocol";
import { VaultValidationError, type AdmissionObservation } from "./facilitator.js";
import {
  BaseError,
  ContractFunctionRevertedError,
  getAddress,
  keccak256,
  recoverTypedDataAddress,
  createPublicClient,
  custom,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type EIP1193RequestFn,
} from "viem";

export type VaultDeployment = {
  chainId: number;
  asset: Address;
  vault: Address;
  relayer: Address;
  expectedCodeHash: Hex;
  feeCapBps: number;
  maxQuoteLifetimeSeconds: number;
  maxHoldSeconds: number;
};
export type VaultRpcClient = Pick<
  PublicClient,
  "getChainId" | "getBlock" | "getCode" | "readContract" | "simulateContract"
>;
const RELAYER_ROLE = keccak256(stringToHex("RELAYER_ROLE"));
const reverts: Record<string, string> = {
  Unauthorized: "unauthorized_relayer",
  EnforcedPause: "vault_paused",
  InvalidAsset: "invalid_asset",
  InvalidConfiguration: "invalid_configuration",
  InvalidAmount: "invalid_amount",
  InvalidSignature: "invalid_signature",
  GrantNotFound: "grant_not_found",
  GrantRevoked: "grant_revoked",
  GrantExpired: "grant_expired",
  GrantEpochMismatch: "grant_epoch_mismatch",
  InsufficientAvailable: "insufficient_available",
  PerCallLimitExceeded: "per_call_limit_exceeded",
  PeriodLimitExceeded: "period_limit_exceeded",
  TotalLimitExceeded: "total_limit_exceeded",
  FeeCapExceeded: "fee_cap_exceeded",
  QuoteExpired: "quote_expired",
  DeadlineInvalid: "deadline_invalid",
  InvocationConflict: "invocation_conflict",
};
function assert(condition: boolean, code: string, status = 422): asserts condition {
  if (!condition) throw new VaultValidationError(code, status);
}
async function rpc<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof VaultValidationError) throw error;
    const revert =
      error instanceof BaseError
        ? error.walk((e) => e instanceof ContractFunctionRevertedError)
        : undefined;
    if (revert instanceof ContractFunctionRevertedError) {
      throw new VaultValidationError(
        reverts[revert.data?.errorName ?? ""] ?? "simulation_reverted",
      );
    }
    throw new VaultValidationError("rpc_unavailable", 503);
  }
}

// Deployment overrides exist for isolated local-EVM tests. Production constructs
// this only from facilitator config with fixed Fuji chain/USDC constants.
export class VaultChain {
  private initialized = false;
  constructor(
    private readonly client: VaultRpcClient,
    readonly deployment: Readonly<VaultDeployment>,
  ) {
    this.deployment = Object.freeze({ ...deployment });
  }
  // Raw EIP-1193 transport keeps peer-specific viem Client/Chain types and error
  // classes out of the integration boundary (e.g. Hardhat's separate peer tree).
  static fromRpc(request: EIP1193RequestFn, deployment: VaultDeployment) {
    return new VaultChain(
      createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }),
      deployment,
    );
  }

  async initialize() {
    this.initialized = false;
    const d = this.deployment;
    assert(
      d.vault !== zeroAddress && d.relayer !== zeroAddress && d.asset !== zeroAddress,
      "deployment_mismatch",
      503,
    );
    assert(/^0x[0-9a-fA-F]{64}$/.test(d.expectedCodeHash), "deployment_mismatch", 503);
    assert((await rpc(() => this.client.getChainId())) === d.chainId, "chain_mismatch", 503);
    const block = await rpc(() => this.client.getBlock({ blockTag: "latest" }));
    assert(block.number !== null && block.hash !== null, "snapshot_unavailable", 503);
    const code = await rpc(() =>
      this.client.getCode({ address: d.vault, blockNumber: block.number! }),
    );
    assert(
      !!code && code !== "0x" && keccak256(code).toLowerCase() === d.expectedCodeHash.toLowerCase(),
      "vault_code_mismatch",
      503,
    );
    const read = { address: d.vault, abi: vaultAdmissionAbi, blockNumber: block.number } as const;
    const [asset, decimals, fee, quoteCap, holdCap, role] = await rpc(() =>
      Promise.all([
        this.client.readContract({ ...read, functionName: "asset" }),
        this.client.readContract({ ...read, address: d.asset, functionName: "decimals" }),
        this.client.readContract({ ...read, functionName: "feeCapBps" }),
        this.client.readContract({ ...read, functionName: "maxQuoteLifetimeSeconds" }),
        this.client.readContract({ ...read, functionName: "maxHoldSeconds" }),
        this.client.readContract({
          ...read,
          functionName: "hasRole",
          args: [RELAYER_ROLE, d.relayer],
        }),
      ]),
    );
    assert(getAddress(asset) === getAddress(d.asset) && decimals === 6, "asset_mismatch", 503);
    assert(
      fee === d.feeCapBps && quoteCap === d.maxQuoteLifetimeSeconds && holdCap === d.maxHoldSeconds,
      "deployment_caps_mismatch",
      503,
    );
    assert(role, "unauthorized_relayer", 503);
    await this.canonical(block.number, block.hash);
    this.initialized = true;
  }

  private async canonical(number: bigint, hash: Hex) {
    const current = await rpc(() => this.client.getBlock({ blockNumber: number }));
    assert(
      current.number === number && current.hash?.toLowerCase() === hash.toLowerCase(),
      "snapshot_changed",
      503,
    );
  }

  async validate(
    q: InvocationQuote,
    authorization: DebitAuthorization,
    signature: Hex,
    admissionGate: () => Promise<void>,
  ): Promise<AdmissionObservation> {
    assert(this.initialized, "chain_not_initialized", 503);
    const d = this.deployment;
    const domain = vaultDomain(d.vault, d.chainId);
    const quoteDigest = hashQuote(domain, q);
    const digest = hashAuthorization(domain, authorization);
    assert(
      authorization.quoteDigest.toLowerCase() === quoteDigest.toLowerCase(),
      "invalid_signature",
    );
    assert((await rpc(() => this.client.getChainId())) === d.chainId, "chain_mismatch", 503);
    const block = await rpc(() => this.client.getBlock({ blockTag: "latest" }));
    assert(block.number !== null && block.hash !== null, "snapshot_unavailable", 503);
    const read = { address: d.vault, abi: vaultAdmissionAbi, blockNumber: block.number } as const;
    let outcome: AdmissionObservation | undefined;
    let failure: unknown;
    try {
      const hold = await rpc(() =>
        this.client.readContract({ ...read, functionName: "getHold", args: [q.invocationKey] }),
      );
      const observed = {
        payer: q.buyer,
        quoteDigest,
        authorizationDigest: digest,
        block: {
          number: block.number.toString(),
          hash: block.hash,
          timestamp: block.timestamp.toString(),
        },
      };
      if (getAddress(hold.buyer) !== zeroAddress) {
        assert(
          hold.quoteDigest === quoteDigest && hold.authorizationDigest === digest,
          "invocation_conflict",
          409,
        );
        assert(
          getAddress(hold.buyer) === getAddress(q.buyer) &&
            getAddress(hold.provider) === getAddress(q.provider) &&
            getAddress(hold.feeRecipient) === getAddress(q.feeRecipient) &&
            hold.gross === q.grossAmount &&
            hold.feeBps === q.feeBps &&
            hold.deliveryDeadline === q.deliveryDeadline &&
            hold.releaseNotBefore === q.releaseNotBefore &&
            hold.resolveBy === q.resolveBy &&
            hold.grantId.toLowerCase() === authorization.grantId.toLowerCase(),
          "hold_inconsistent",
          503,
        );
        outcome = { ...observed, kind: "existing-hold" };
      } else {
        await admissionGate();
        const [grant, available, paused, role, feeCap, quoteCap, holdCap, asset] = await rpc(() =>
          Promise.all([
            this.client.readContract({
              ...read,
              functionName: "getGrant",
              args: [q.buyer, authorization.grantId],
            }),
            this.client.readContract({
              ...read,
              functionName: "availableBalance",
              args: [q.buyer],
            }),
            this.client.readContract({ ...read, functionName: "paused" }),
            this.client.readContract({
              ...read,
              functionName: "hasRole",
              args: [RELAYER_ROLE, d.relayer],
            }),
            this.client.readContract({ ...read, functionName: "feeCapBps" }),
            this.client.readContract({ ...read, functionName: "maxQuoteLifetimeSeconds" }),
            this.client.readContract({ ...read, functionName: "maxHoldSeconds" }),
            this.client.readContract({ ...read, functionName: "asset" }),
          ]),
        );
        const now = block.timestamp;
        assert(!paused, "vault_paused");
        assert(role, "unauthorized_relayer");
        assert(
          getAddress(asset) === getAddress(d.asset) && getAddress(q.asset) === getAddress(d.asset),
          "invalid_asset",
        );
        assert(
          q.buyer !== zeroAddress && q.provider !== zeroAddress && q.feeRecipient !== zeroAddress,
          "invalid_configuration",
        );
        assert(q.grossAmount > 0n, "invalid_amount");
        assert(q.feeBps <= feeCap, "fee_cap_exceeded");
        assert(now < BigInt(q.validUntil), "quote_expired");
        assert(
          q.validUntil < q.deliveryDeadline &&
            q.deliveryDeadline <= q.releaseNotBefore &&
            q.releaseNotBefore < q.resolveBy &&
            BigInt(q.validUntil) - now <= BigInt(quoteCap) &&
            BigInt(q.resolveBy) - now <= BigInt(holdCap),
          "deadline_invalid",
        );
        assert(grant.epoch !== 0n, "grant_not_found");
        assert(!grant.revoked, "grant_revoked");
        assert(now < BigInt(grant.config.expiresAt), "grant_expired");
        assert(authorization.grantEpoch === grant.epoch, "grant_epoch_mismatch");
        let signer: Address;
        try {
          signer = await recoverTypedDataAddress({
            domain,
            types: paymentTypes,
            primaryType: "DebitAuthorization",
            message: authorization,
            signature,
          });
        } catch {
          throw new VaultValidationError("invalid_signature");
        }
        assert(getAddress(signer) === getAddress(grant.config.signer), "invalid_signature");
        assert(q.grossAmount <= available, "insufficient_available");
        assert(q.grossAmount <= grant.config.maxPerCall, "per_call_limit_exceeded");
        assert(grant.config.periodSeconds > 0, "invalid_grant_configuration", 503);
        const period = now / BigInt(grant.config.periodSeconds);
        const spent = grant.currentPeriod === period ? grant.spentInPeriod : 0n;
        assert(
          spent <= grant.config.maxPerPeriod && q.grossAmount <= grant.config.maxPerPeriod - spent,
          "period_limit_exceeded",
        );
        assert(
          grant.spentTotal <= grant.config.maxTotal &&
            q.grossAmount <= grant.config.maxTotal - grant.spentTotal,
          "total_limit_exceeded",
        );
        const simulation = await rpc(() =>
          this.client.simulateContract({
            ...read,
            functionName: "reserveHold",
            args: [q, authorization, signature],
            account: d.relayer,
          }),
        );
        assert(
          simulation.result.toLowerCase() === q.invocationKey.toLowerCase(),
          "simulation_inconsistent",
          503,
        );
        outcome = { ...observed, kind: "new-admission" };
      }
    } catch (error) {
      failure = error;
    }
    // Even a business rejection must not be attributed to an orphaned snapshot.
    await this.canonical(block.number, block.hash);
    if (failure) throw failure;
    return outcome!;
  }
}
