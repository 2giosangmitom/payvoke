import { expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { diskStore } from "../src/state";

test("disk state survives reopening, uses distinct safe paths and expires", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cv-reviewer-"));
  expect(
    resolve(directory).startsWith(resolve(tmpdir()) + sep) &&
      basename(directory).startsWith("cv-reviewer-"),
  ).toBe(true);
  try {
    const store = diskStore<{ version: number }>(directory, "jobs");
    await store.put("../job", { version: 1 });
    await store.put(".._job", { version: 2 });
    expect(await diskStore<{ version: number }>(directory, "jobs").get("../job")).toEqual({
      version: 1,
    });
    expect(await store.get(".._job")).toEqual({ version: 2 });
    expect(await store.get("missing")).toBeNull();
    await store.put("expired", { version: 3 }, -1);
    expect(await store.get("expired")).toBeNull();
    await store.cleanup();
    expect(await readdir(join(directory, "jobs"))).toHaveLength(2);
  } finally {
    // mkdtemp returns this test's dedicated directory; never delete a workspace path.
    await rm(directory, { recursive: true, force: true });
  }
});
