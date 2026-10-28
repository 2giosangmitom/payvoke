// Runs the backend, protocol and vault suites once, then checks every rule in
// test/conformance/rules.ts against the tests that actually passed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rules, type Suite } from "../test/e2e/conformance/rules";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const bun = "bun test test/";
// The backend suite covers the API, its in-process facilitator and workers.
const commands: Record<Suite, { cwd: string; command: string }[]> = {
  backend: [{ cwd: `${root}apps/api`, command: bun }],
  protocol: [{ cwd: `${root}packages/shared`, command: bun }],
  vault: [{ cwd: `${root}packages/vault`, command: "bunx hardhat test" }],
};

type Outcome = "pass" | "fail" | "skip";

function parse(suite: Suite, output: string) {
  const results = new Map<string, Outcome>();
  for (const line of output.split("\n")) {
    if (suite === "vault") {
      // Hardhat: "✔ name (runs: 256)" / "✔ name (96ms)"; failures are numbered.
      const match = /^\s*(✔|✘|✖|\d+\))\s+(.+?)\s*(\(runs: \d+\))?\s*(\(\d+ms\))?\s*$/.exec(line);
      if (match) results.set(match[2], match[1] === "✔" ? "pass" : "fail");
      continue;
    }
    // bun test: "(pass) describe > name [12.00ms]"; the rules name the test only.
    const match = /^\((pass|fail|skip|todo)\) (.+?)(?: \[[\d.]+m?s\])?$/.exec(line);
    if (match)
      results.set(match[2].split(" > ").at(-1)!, match[1] === "todo" ? "skip" : (match[1] as Outcome));
  }
  return results;
}

const outcomes = {} as Record<Suite, Map<string, Outcome>>;
for (const suite of Object.keys(commands) as Suite[]) {
  outcomes[suite] = new Map();
  for (const { cwd, command } of commands[suite]) {
    console.log(`> ${suite}: ${command} (${cwd.slice(root.length)})`);
    const run = spawnSync(command, { cwd, shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
    for (const [test, outcome] of parse(suite, `${run.stdout}\n${run.stderr}`))
      outcomes[suite].set(test, outcome);
    if (run.status !== 0)
      console.log(`  ${suite} suite exited ${run.status}; failures are reported below`);
  }
}

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
