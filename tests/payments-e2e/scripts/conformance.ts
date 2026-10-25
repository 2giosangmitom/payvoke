// Runs the backend, protocol and vault suites once, then checks every rule in
// test/conformance/rules.ts against the tests that actually passed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rules, type Suite } from "../test/conformance/rules";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const node = "pnpm exec tsx --test --test-reporter=tap test/*.test.ts";
// The backend suite spans every service package that owns payment tests.
const commands: Record<Suite, { cwd: string; command: string }[]> = {
  backend: ["apps/api", "apps/facilitator", "apps/ops", "tests/payments-e2e"].map((dir) => ({
    cwd: `${root}${dir}`,
    command: node,
  })),
  protocol: [{ cwd: `${root}packages/payvoke-protocol`, command: node }],
  vault: [{ cwd: `${root}packages/payvoke-vault`, command: "pnpm exec hardhat test" }],
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
    const match = /^\s*(not )?ok \d+ - (.+?)(\s+#\s*(SKIP|TODO).*)?$/.exec(line);
    if (match) results.set(match[2], match[3] ? "skip" : match[1] ? "fail" : "pass");
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
