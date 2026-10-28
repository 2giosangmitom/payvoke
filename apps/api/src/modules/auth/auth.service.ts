import type { Cradle } from "../../container";
import { ForbiddenError, UnauthorizedError } from "../../errors";
import { isBuyerToken } from "./access-token.service";

export type AccountIdentity = { id: string; walletAddress: string };

// Resolves Better Auth sessions and buyer access tokens to the buyer identity Payvoke uses: an active
// user with a primary Fuji wallet.
export class AuthService {
  private readonly auth: Cradle["auth"];
  private readonly db: Cradle["db"];
  private readonly apiOrigin: string;
  private readonly accessTokenService: Cradle["accessTokenService"];

  constructor({ auth, db, config, accessTokenService }: Cradle) {
    this.auth = auth;
    this.db = db;
    this.accessTokenService = accessTokenService;
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

  // A buyer access token (`Bearer pvb_…`) stands in for the session; the
  // request then never reads cookies. Otherwise the Better Auth session.
  private async user(headers: Headers) {
    const authorization = headers.get("authorization") ?? undefined;
    if (isBuyerToken(authorization)) {
      const id = await this.accessTokenService.userId(authorization);
      const user = await this.db.user.findUnique({ where: { id }, select: { status: true } });
      if (!user) throw new UnauthorizedError("INVALID_ACCESS_TOKEN");
      return { id, status: user.status };
    }
    const session = await this.session(headers);
    return session ? { id: session.user.id, status: session.user.status } : null;
  }

  async optionalAccount(headers: Headers): Promise<AccountIdentity | null> {
    // A bad token on a public route reads as signed out, like a stale cookie.
    const user = await this.user(headers).catch((error: unknown) => {
      if (error instanceof UnauthorizedError) return null;
      throw error;
    });
    if (!user || user.status !== "ACTIVE") return null;
    const walletAddress = await this.primaryWallet(user.id);
    return walletAddress ? { id: user.id, walletAddress } : null;
  }

  async requireAccount(headers: Headers): Promise<AccountIdentity> {
    const user = await this.user(headers);
    if (!user) throw new UnauthorizedError("UNAUTHENTICATED");
    if (user.status !== "ACTIVE") throw new ForbiddenError("ACCOUNT_SUSPENDED");
    const walletAddress = await this.primaryWallet(user.id);
    if (!walletAddress) throw new UnauthorizedError("UNAUTHENTICATED");
    return { id: user.id, walletAddress };
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
