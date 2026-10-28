// Runs the backend, protocol and vault suites once, then checks every rule in
// test/conformance/rules.ts against the tests that actually passed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { rules, type Suite } from "../test/e2e/conformance/rules";

type Outcome = "pass" | "fail" | "skip";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const reports = mkdtempSync(join(tmpdir(), "payvoke-conformance-"));
// bun test prints only failures when not on a terminal, so outcomes come from
// its JUnit report instead of its console output.
const bun = (suite: Suite) => {
  const report = join(reports, `${suite}.xml`);
  return { command: `bun test test/ --reporter=junit --reporter-outfile=${report}`, report };
};
// The backend suite covers the API, its in-process facilitator and workers.
const commands: Record<Suite, { cwd: string; command: string; report?: string }[]> = {
  backend: [{ cwd: `${root}apps/api`, ...bun("backend") }],
  protocol: [{ cwd: `${root}packages/shared`, ...bun("protocol") }],
  vault: [{ cwd: `${root}packages/vault`, command: "bunx hardhat test" }],
};

const entities: Record<string, string> = {
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
};
const unescape = (text: string) => text.replace(/&(quot|apos|#39|lt|gt|amp);/g, (e) => entities[e]);

// bun test JUnit: <testcase name="…"/> passed; a <failure>/<error> child failed;
// a <skipped/> or <todo/> child was skipped. The rules name the test only.
function parseJunit(xml: string) {
  const results = new Map<string, Outcome>();
  for (const match of xml.matchAll(
    /<testcase name="([^"]*)"[^>]*?(?:\/>|>([\s\S]*?)<\/testcase>)/g,
  )) {
    const body = match[2] ?? "";
    const outcome: Outcome = /<(failure|error)\b/.test(body)
      ? "fail"
      : /<(skipped|todo)\b/.test(body)
        ? "skip"
        : "pass";
    results.set(unescape(match[1]), outcome);
  }
  return results;
}

// Hardhat: "✔ name (runs: 256)" / "✔ name (96ms)"; failures are numbered.
function parseHardhat(output: string) {
  const results = new Map<string, Outcome>();
  for (const line of output.split("\n")) {
    const match = /^\s*(✔|✘|✖|\d+\))\s+(.+?)\s*(\(runs: \d+\))?\s*(\(\d+ms\))?\s*$/.exec(line);
    if (match) results.set(match[2], match[1] === "✔" ? "pass" : "fail");
  }
  return results;
}

const outcomes = {} as Record<Suite, Map<string, Outcome>>;
for (const suite of Object.keys(commands) as Suite[]) {
  outcomes[suite] = new Map();
  for (const { cwd, command, report } of commands[suite]) {
    console.log(`> ${suite}: ${command} (${cwd.slice(root.length)})`);
    const run = spawnSync(command, { cwd, shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
    const results = report
      ? parseJunit(readFileSync(report, "utf8"))
      : parseHardhat(`${run.stdout}\n${run.stderr}`);
    for (const [test, outcome] of results) outcomes[suite].set(test, outcome);
    if (run.status !== 0)
      console.log(`  ${suite} suite exited ${run.status}; failures are reported below`);
  }
}
rmSync(reports, { recursive: true, force: true });

let failed = false;
for (const rule of rules) {
  if (rule.deferred) {
    console.log(`DEFERRED ${rule.id} (${rule.source}) ${rule.requirement}\n  ${rule.deferred}`);
    continue;
  }
  const lines = rule.evidence.map((e) => ({ ...e, outcome: outcomes[e.suite].get(e.test) }));
  const ok = lines.some((line) => line.outcome === "pass");
  const broken = lines.filter((line) => line.outcome !== "pass");
  if (!ok || broken.length) failed = true;
  console.log(
    `${ok && !broken.length ? "PASS" : "FAIL"} ${rule.id} (${rule.source}) ${rule.requirement}`,
  );
  for (const line of lines)
    console.log(`  [${line.outcome ?? "missing"}] ${line.suite}: ${line.test}`);
}
process.exit(failed ? 1 : 0);
