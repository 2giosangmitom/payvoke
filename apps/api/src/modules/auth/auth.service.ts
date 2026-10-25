import type { IncomingHttpHeaders } from "node:http";
import type { Cradle } from "@fastify/awilix";
import { fromNodeHeaders } from "better-auth/node";
import { ForbiddenError, UnauthorizedError } from "../../errors";

export type AccountIdentity = { id: string; walletAddress: string };

// Resolves Better Auth sessions to the buyer identity Payvoke uses: an active
// user with a primary Fuji wallet.
export class AuthService {
  private readonly auth: Cradle["auth"];
  private readonly db: Cradle["db"];
  private readonly apiOrigin: string;

  constructor({ auth, db, config }: Cradle) {
    this.auth = auth;
    this.db = db;
    this.apiOrigin = config.API_ORIGIN;
  }

  private session(headers: IncomingHttpHeaders) {
    return this.auth.api.getSession({ headers: fromNodeHeaders(headers) });
  }

  private async primaryWallet(userId: string) {
    const wallet = await this.db.walletAddress.findFirst({
      where: { userId, chainId: 43113, isPrimary: true },
    });
    return wallet?.address.toLowerCase() ?? null;
  }

  async optionalAccount(headers: IncomingHttpHeaders): Promise<AccountIdentity | null> {
    const session = await this.session(headers);
    if (!session || session.user.status !== "ACTIVE") return null;
    const walletAddress = await this.primaryWallet(session.user.id);
    return walletAddress ? { id: session.user.id, walletAddress } : null;
  }

  async requireAccount(headers: IncomingHttpHeaders): Promise<AccountIdentity> {
    const session = await this.session(headers);
    if (!session) throw new UnauthorizedError("UNAUTHENTICATED");
    if (session.user.status !== "ACTIVE") throw new ForbiddenError("ACCOUNT_SUSPENDED");
    const walletAddress = await this.primaryWallet(session.user.id);
    if (!walletAddress) throw new UnauthorizedError("UNAUTHENTICATED");
    return { id: session.user.id, walletAddress };
  }

  // Forwards a native Better Auth request. The configured API origin is
  // trusted, never the request's Host header.
  handle(url: string, method: string, headers: IncomingHttpHeaders, body: unknown) {
    return this.auth.handler(
      new Request(new URL(url, this.apiOrigin), {
        method,
        headers: fromNodeHeaders(headers),
        ...(method === "POST" && body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
    );
  }
}
