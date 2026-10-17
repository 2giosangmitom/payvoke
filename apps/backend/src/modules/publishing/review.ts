import { createOrm } from "../../database/orm.js";
import { loadEnvironment } from "../../config/environment.js";
import { MikroOrmPublishingRepository } from "./infrastructure/mikro-orm-publishing.repository.js";

// Trusted local operator command, never exposed as an HTTP route or provider role.
const [listingId, versionId, digest, decision, reviewer, note] = process.argv.slice(2);
if (
  !listingId ||
  !versionId ||
  !/^[0-9a-f-]{36}$/i.test(listingId) ||
  !/^[0-9a-f-]{36}$/i.test(versionId) ||
  !digest ||
  !/^[a-f0-9]{64}$/.test(digest) ||
  (decision !== "approved" && decision !== "rejected") ||
  !reviewer?.trim() ||
  reviewer.length > 100 ||
  !note?.trim() ||
  note.length > 4000
) {
  console.error(
    "Usage: publishing:review <listing UUID> <version UUID> <digest> <approved|rejected> <operator> <review note>",
  );
  process.exitCode = 1;
} else {
  const orm = await createOrm(loadEnvironment());
  try {
    const result = await new MikroOrmPublishingRepository(orm.em.fork()).review(
      listingId,
      versionId,
      { digest, decision, reviewer, note },
    );
    if (result.isErr()) {
      console.error(result.error.message);
      process.exitCode = 1;
    } else
      console.log(
        `Catalog review ${result.value.state}: ${result.value.id}. Execution remains disabled.`,
      );
  } finally {
    await orm.close();
  }
}
