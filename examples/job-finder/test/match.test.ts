import { expect, test } from "bun:test";
import { findMatches, matchInput, MatchError, runMatch, type Matches } from "../src/match";
import { Payvoke, Run, type AguiEvent, type Report } from "../src/payvoke";

// Records reports, stream lines and uploads instead of calling the network.
class FakePayvoke extends Payvoke {
  reports: Report[] = [];
  streamed: AguiEvent[] = [];
  uploads: { name: string; contentType: string; body: string }[] = [];
  uploadError: Error | null = null;
  constructor() {
    super("https://example.invalid", "test-app", "pvk_test");
  }
  override report: Payvoke["report"] = async (_id, report) => {
    this.reports.push(structuredClone(report));
    return { lastCommittedSequence: report.sequence };
  };
  override stream: Payvoke["stream"] = async (_id, _run, lines) => {
    this.streamed.push(...lines.map((l) => l.event));
    return { lastCommittedSequence: lines.at(-1)!.streamSequence };
  };
  override upload: Payvoke["upload"] = async (_id, name, contentType, bytes) => {
    if (this.uploadError) throw this.uploadError;
    this.uploads.push({ name, contentType, body: new TextDecoder().decode(bytes) });
    return `file-${this.uploads.length}`;
  };
}

const roles = (n = 5): Matches["roles"] =>
  Array.from({ length: n }, (_, i) => ({
    title: `Frontend Developer ${i + 1}`,
    fit: 60 + i * 5,
    location: "Hà Nội",
    salary: "20-30 triệu VNĐ/tháng",
    why: "Kỹ năng React phù hợp.",
    gaps: i ? ["Next.js"] : [],
  }));

test("match is an instant command with STRING options only", async () => {
  // commands.ts reads config at import time; give it a test environment.
  Object.assign(process.env, {
    PAYVOKE_APP_ID: process.env.PAYVOKE_APP_ID || "test-app",
    PAYVOKE_KEY: process.env.PAYVOKE_KEY || "pvk_test",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "test",
  });
  const { commandDefinitions } = await import("../src/commands");
  const match = commandDefinitions.find((c) => c.name === "match")!;
  expect(match.instantAmount).toBe("300000");
  expect(BigInt(match.maxAmount) >= BigInt(match.instantAmount!)).toBe(true);
  expect(match.options.map((o) => [o.name, o.type, o.required ?? false, o.maxLength])).toEqual([
    ["skills", "STRING", true, 2000],
    ["location", "STRING", false, 200],
  ]);
  expect(match.terms).toMatchObject({ verification: { minEvidence: "REC" } });
  expect(commandDefinitions.find((c) => c.name === "find_job")!.instantAmount).toBeUndefined();
});

test("instant run delivers the top 5 roles, best fit first, with a REC file", async () => {
  const api = new FakePayvoke();
  const prompts: string[] = [];
  await runMatch(
    new Run(api, "job-1", "run-1"),
    { skills: " React, TypeScript ", location: "Hà Nội" },
    async (prompt) => {
      prompts.push(prompt);
      return { roles: roles() };
    },
  );
  expect(prompts[0]).toContain('"skills":"React, TypeScript"');
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toMatchObject({ name: "job-matches.md", contentType: "text/markdown" });
  const result = api.reports.at(-1)!;
  if (result.type !== "result") throw new Error("expected result");
  expect(result.data).toMatchObject({ artifactVersion: 1, files: [{ fileId: "file-1" }] });
  const output = result.data.output as string;
  expect(output.match(/^### \d\./gm)).toHaveLength(5);
  expect(output.indexOf("Frontend Developer 5")).toBeLessThan(
    output.indexOf("Frontend Developer 1"),
  );
  expect(output).toContain("https://www.topcv.vn/tim-viec-lam-frontend-developer-5-tai-ha-noi");
  expect(api.uploads[0]!.body).toBe(output);
  expect(api.streamed.at(-1)!.type).toBe("TEXT_MESSAGE_END");
});

test("the generator is retried once on invalid output", async () => {
  let calls = 0;
  const result = await findMatches(
    async () => (++calls === 1 ? { roles: roles(3) } : { roles: roles() }),
    {
      skills: "SQL",
    },
  );
  expect(result.roles).toHaveLength(5);
  expect(calls).toBe(2);
});

test("bad input, model failure and upload failure throw before any result", async () => {
  const cases: [Record<string, unknown>, "model" | "upload" | null][] = [
    [{}, null],
    [{ skills: "x".repeat(2001) }, null],
    [{ skills: "React", location: 5 }, null],
    [{ skills: "React" }, "model"],
    [{ skills: "React" }, "upload"],
  ];
  for (const [args, failure] of cases) {
    const api = new FakePayvoke();
    if (failure === "upload") api.uploadError = new Error("storage offline");
    const run = new Run(api, "job-1", "run-1");
    const attempt = runMatch(run, args, async () => {
      if (failure === "model") throw new Error("rate limited");
      return { roles: roles() };
    });
    if (failure === "upload") await expect(attempt).rejects.toThrow("storage offline");
    else await expect(attempt).rejects.toBeInstanceOf(MatchError);
    expect(api.reports.some((r) => r.type === "result")).toBe(false);
  }
  expect(() => matchInput({ skills: "a" })).toThrow(MatchError);
});
