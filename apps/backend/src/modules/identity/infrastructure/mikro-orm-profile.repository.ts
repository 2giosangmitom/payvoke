import type { EntityManager } from "@mikro-orm/postgresql";
import type { ProfileRepository } from "../application/profile.repository.js";
import { AppUser } from "../domain/app-user.js";

export class MikroOrmProfileRepository implements ProfileRepository {
  readonly #em: EntityManager;

  constructor({ em }: { em: EntityManager }) {
    this.#em = em;
  }

  async getOrCreate(accountId: string): Promise<AppUser> {
    const existing = await this.#em.findOne(AppUser, accountId);
    if (existing) return existing;

    const profile = new AppUser();
    profile.id = accountId;
    // Concurrent first requests must not overwrite an existing profile or status.
    await this.#em.createQueryBuilder(AppUser).insert(profile).onConflict("id").ignore().execute();
    return this.get(accountId);
  }

  async get(accountId: string): Promise<AppUser> {
    return this.#em.findOneOrFail(AppUser, accountId);
  }

  async save(user: AppUser): Promise<void> {
    await this.#em.persist(user).flush();
  }
}
