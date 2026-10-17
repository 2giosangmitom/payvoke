import { Result } from "better-result";
import type { EntityManager } from "@mikro-orm/postgresql";
import type { IdentityResult } from "./identity.errors.js";

export async function identityTransaction<T>(
  em: EntityManager,
  work: (transaction: EntityManager) => Promise<IdentityResult<T>>,
): Promise<IdentityResult<T>> {
  // MikroORM commits returned values, including Err. Use a private sentinel to force rollback.
  const abort = new Error("Identity transaction rejected");
  let rejected: IdentityResult<never> | undefined;
  try {
    return await em.transactional(
      async (transaction) => {
        const result = await work(transaction);
        if (result.isErr()) {
          rejected = Result.err(result.error);
          throw abort;
        }
        return result;
      },
      { clear: true },
    );
  } catch (error) {
    if (error === abort && rejected) return rejected;
    // Database failures and programming defects are not routine identity errors.
    throw error;
  }
}
