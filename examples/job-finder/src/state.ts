import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config";

export type PendingTool =
  | { kind: "intake"; threadId: string }
  | { kind: "service_choice"; threadId: string; fileId: string; goal?: string; location?: string };

export type Job = {
  command: "analyze_cv" | "find_job";
  threadId: string;
  fileId: string;
  fileName: string;
  location?: string;
  goal?: string;
  depth: "quick" | "deep";
  metric?: string | null;
  artifactVersion: number;
};

const path = (kind: string, id: string) =>
  join(config.STATE_DIR, kind, `${id.replace(/[^\\w-]/g, "_")}.json`);

async function put(kind: string, id: string, value: unknown) {
  await mkdir(join(config.STATE_DIR, kind), { recursive: true });
  await writeFile(path(kind, id), JSON.stringify(value));
}

async function get<T>(kind: string, id: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path(kind, id), "utf8")) as T;
  } catch {
    return null;
  }
}

export const tools = {
  put: (messageId: string, tool: PendingTool) => put("tools", messageId, tool),
  get: (messageId: string) => get<PendingTool>("tools", messageId),
};

export const jobs = {
  put: (invocationId: string, job: Job) => put("jobs", invocationId, job),
  get: (invocationId: string) => get<Job>("jobs", invocationId),
};
