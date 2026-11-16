import { expect, test } from "bun:test";
// Payvoke's own ingress validator: if it accepts these patches, so does the API.
import { applyOpenUIPatch } from "../../../apps/api/src/modules/openui/validator";
import { commandDefinitions } from "../src/commands";
import { CsvError } from "../src/csv";
import { Payvoke, Run, type AguiEvent, type Report } from "../src/payvoke";
import { parseProfileInput, qualityFlags, runProfile } from "../src/profile";
import { salesCsv } from "./fixtures";

// Records reports and stream lines instead of calling the network.
class FakePayvoke extends Payvoke {
  reports: Report[] = [];
  streamed: AguiEvent[] = [];
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
}

test("profile is an instant command that takes CSV text, not a file", () => {
  const profile = commandDefinitions.find((c) => c.name === "profile")!;
  expect(profile.instantAmount).toBe("200000");
  expect(BigInt(profile.maxAmount) >= BigInt(profile.instantAmount!)).toBe(true);
  expect(profile.options).toEqual([
    expect.objectContaining({ name: "csv", type: "STRING", required: true, maxLength: 200000 }),
  ]);
  expect(profile.options.some((o) => o.type === "FILE")).toBe(false);
  expect(profile.terms).toMatchObject({ verification: { minEvidence: "SIGN" } });
  expect(commandDefinitions.find((c) => c.name === "analyze")!.instantAmount).toBeUndefined();
});

test("quality flags find duplicates, missing values, constants and outliers", () => {
  const csv = `${salesCsv}\n${salesCsv.split("\n")[1]}`;
  const { rows, profile } = parseProfileInput({ csv });
  const flags = qualityFlags(rows, profile);
  expect(flags).toContainEqual({ column: null, issue: "1 duplicate row" });
  expect(flags).toContainEqual({ column: "note", issue: expect.stringContaining("missing") });
  expect(flags).toContainEqual({ column: "revenue", issue: expect.stringContaining("1 outlier") });

  const odd = parseProfileInput({ csv: "a,,c\n1,,x\n2,,x\n" });
  const oddFlags = qualityFlags(odd.rows, odd.profile);
  expect(oddFlags).toContainEqual({ column: "column_2", issue: "Missing header" });
  expect(oddFlags).toContainEqual({ column: "column_2", issue: "Every value is empty" });
  expect(oddFlags).toContainEqual({ column: "c", issue: "Constant: only one distinct value" });
});

test("instant run streams a valid surface and ends with a result, no download", async () => {
  const api = new FakePayvoke();
  api.download = async () => {
    throw new Error("instant profile must not download");
  };
  const run = new Run(api, "job-1", "run-1");
  const uploaded: string[] = [];
  await runProfile(run, { csv: salesCsv }, async (name) => {
    uploaded.push(name);
    return [{ fileId: "file-1" }];
  });
  expect(uploaded).toEqual(["profile.json"]);
  const result = api.reports.at(-1)!;
  if (result.type !== "result") throw new Error("expected result");
  expect(result.data.artifactVersion).toBe(1);
  expect(result.data.files).toEqual([{ fileId: "file-1" }]);
  expect(result.data.output).toContain("60 rows, 6 columns");
  expect(result.data.output).toContain("## Data quality");
  let source = "";
  for (const event of api.streamed) {
    if (event.type !== "CUSTOM") continue;
    expect(event.value.source.length).toBeLessThanOrEqual(8192);
    source = applyOpenUIPatch(source, event.value.source);
  }
  expect(source).toContain("Data quality");
});

test("a result is still delivered when the optional upload fails", async () => {
  const api = new FakePayvoke();
  await runProfile(new Run(api, "job-1", "run-1"), { csv: salesCsv }, async () => []);
  expect(api.reports.at(-1)).toMatchObject({ type: "result", data: { files: [] } });
});

test("bad input throws CsvError before anything is delivered", async () => {
  for (const args of [
    {},
    { csv: "" },
    { csv: "a,b\n" },
    { csv: "x".repeat(200_001) },
    { csv: 5 },
  ]) {
    const api = new FakePayvoke();
    const run = new Run(api, "job-1", "run-1");
    await expect(runProfile(run, args, async () => [])).rejects.toBeInstanceOf(CsvError);
    expect(api.reports.some((r) => r.type === "result")).toBe(false);
  }
});
