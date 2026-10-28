import type { Context } from "hono";
import type { Cradle } from "../container";
import type { AccountIdentity } from "../modules/auth/auth.service";

// Per-request values every route can read through `c.var`.
export type AppEnv = {
  Variables: {
    cradle: Cradle;
    // Set by `requireAccount`; null on routes that do not require a session.
    account: AccountIdentity | null;
  };
};

// Routes behind `requireAccount` read a non-null account.
export type SignedInEnv = {
  Variables: AppEnv["Variables"] & { account: AccountIdentity };
};

// What route helpers read from a request, whatever middleware ran before.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RouteContext = Pick<Context<AppEnv, any, any>, "var" | "req">;
