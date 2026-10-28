import type { Cradle } from "../../container";
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

  private session(headers: Headers) {
    return this.auth.api.getSession({ headers });
  }

  private async primaryWallet(userId: string) {
    const wallet = await this.db.walletAddress.findFirst({
      where: { userId, chainId: 43113, isPrimary: true },
    });
    return wallet?.address.toLowerCase() ?? null;
  }

  async optionalAccount(headers: Headers): Promise<AccountIdentity | null> {
    const session = await this.session(headers);
    if (!session || session.user.status !== "ACTIVE") return null;
    const walletAddress = await this.primaryWallet(session.user.id);
    return walletAddress ? { id: session.user.id, walletAddress } : null;
  }

  async requireAccount(headers: Headers): Promise<AccountIdentity> {
    const session = await this.session(headers);
    if (!session) throw new UnauthorizedError("UNAUTHENTICATED");
    if (session.user.status !== "ACTIVE") throw new ForbiddenError("ACCOUNT_SUSPENDED");
    const walletAddress = await this.primaryWallet(session.user.id);
    if (!walletAddress) throw new UnauthorizedError("UNAUTHENTICATED");
    return { id: session.user.id, walletAddress };
  }

  // Forwards a native Better Auth request. The configured API origin is
  // trusted, never the request's Host header.
  async handle(request: Request) {
    const url = new URL(request.url);
    return this.auth.handler(
      new Request(new URL(url.pathname + url.search, this.apiOrigin), {
        method: request.method,
        headers: request.headers,
        ...(request.method === "POST" ? { body: await request.text() } : {}),
      }),
    );
  }
}
