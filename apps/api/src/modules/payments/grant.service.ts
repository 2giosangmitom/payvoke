import { getAddress } from "viem";
import type { Cradle } from "../../container";
import { ConflictError, ForbiddenError, NotFoundError } from "../../errors";

const MAX_GRANTS = 20;

// The console's list of a buyer's vault grants. Registering one here records
// its name and signer only: the grant itself, its limits and whether it is
// revoked live in the vault, which the browser and the signer read directly.
export class GrantService {
  private readonly db: Cradle["db"];

  constructor({ db }: Cradle) {
    this.db = db;
  }

  list(userId: string) {
    return this.db.vaultGrant.findMany({
      where: { userId },
      select: {
        id: true,
        grantId: true,
        buyer: true,
        signer: true,
        kind: true,
        tokenId: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async record(
    userId: string,
    request: { grantId: string; buyer: string; signer: string; kind: string; name: string },
  ) {
    await this.admit(userId, request.buyer);
    const data = {
      userId,
      grantId: request.grantId.toLowerCase(),
      buyer: getAddress(request.buyer),
      signer: getAddress(request.signer),
      kind: request.kind,
      name: request.name,
    };
    const existing = await this.db.vaultGrant.findUnique({
      where: { userId_grantId: { userId, grantId: data.grantId } },
    });
    if (existing) throw new ConflictError("GRANT_ALREADY_RECORDED");
    return this.db.vaultGrant.create({
      data,
      select: {
        id: true,
        grantId: true,
        buyer: true,
        signer: true,
        kind: true,
        tokenId: true,
        name: true,
        createdAt: true,
      },
    });
  }

  // A grant pays from its buyer's vault balance, so the buyer must be the
  // account's own wallet; the list is capped unless the grant replaces one.
  async admit(userId: string, buyer: string, replacing = false) {
    const wallets = await this.db.walletAddress.findMany({
      where: { userId },
      select: { address: true },
    });
    if (!wallets.some((wallet) => wallet.address.toLowerCase() === buyer.toLowerCase()))
      throw new ForbiddenError("GRANT_BUYER_NOT_LINKED");
    if (!replacing && (await this.db.vaultGrant.count({ where: { userId } })) >= MAX_GRANTS)
      throw new ConflictError("TOO_MANY_GRANTS");
  }

  async forget(userId: string, id: string) {
    const result = await this.db.vaultGrant.deleteMany({ where: { id, userId } });
    if (!result.count) throw new NotFoundError("GRANT_NOT_FOUND");
    return { removed: true };
  }
}
