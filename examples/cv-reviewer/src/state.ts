import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileEntry } from "./payvoke";

export type Job = {
  file: FileEntry;
  goal?: string;
  artifactVersion: number;
};
export type PendingIntake = { threadId: string; goal?: string };
export type Store<T> = {
  get(id: string): Promise<T | null>;
  put(id: string, value: T, ttlMs?: number): Promise<void>;
};

export function diskStore<T>(
  directory: string,
  kind: string,
): Store<T> & { cleanup(): Promise<void> } {
  const root = join(directory, kind);
  // Hash IDs: no path traversal or collisions from replacing punctuation.
  const path = (id: string) =>
    join(root, `${new Bun.CryptoHasher("sha256").update(id).digest("hex")}.json`);
  return {
    async get(id) {
      try {
        const record = JSON.parse(await readFile(path(id), "utf8")) as {
          expiresAt: number;
          value: T;
        };
        if (record.expiresAt <= Date.now()) return null;
        return record.value;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async put(id, value, ttlMs = 60 * 60 * 1000) {
      await mkdir(root, { recursive: true });
      const target = path(id);
      const temporary = `${target}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify({ expiresAt: Date.now() + ttlMs, value }), {
        mode: 0o600,
      });
      await rename(temporary, target);
    },
    async cleanup() {
      let names: string[];
      try {
        names = await readdir(root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
      for (const name of names.filter((name) => /^[a-f0-9]{64}\.json$/.test(name))) {
        const target = join(root, name);
        const record = JSON.parse(await readFile(target, "utf8")) as { expiresAt: number };
        if (record.expiresAt <= Date.now()) await unlink(target);
      }
    },
  };
}
