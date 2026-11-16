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

test("profile is an instant command that takes CSV text or a file, priced by size", () => {
  const profile = commandDefinitions.find((c) => c.name === "profile")!;
  expect(profile.instantAmount).toBe("200000");
  expect(profile.instantTiers).toEqual([
    { minInputBytes: 262144, amount: "500000" },
    { minInputBytes: 1048576, amount: "1000000" },
  ]);
  // Every tier fits under the cap buyers see.
  for (const tier of profile.instantTiers!)
    expect(BigInt(tier.amount) <= BigInt(profile.maxAmount)).toBe(true);
  expect(profile.options).toEqual([
    expect.objectContaining({ name: "csv", type: "STRING", maxLength: 200000 }),
    expect.objectContaining({ name: "file", type: "FILE", required: false, accept: ["text/csv"] }),
  ]);
  expect(profile.options[0]!.required).toBeUndefined();
  expect(profile.terms).toMatchObject({ verification: { minEvidence: "SIGN" } });
  expect(commandDefinitions.find((c) => c.name === "analyze")!.instantAmount).toBeUndefined();
});

test("quality flags find duplicates, missing values, constants and outliers", () => {
  const csv = `${salesCsv}\n${salesCsv.split("\n")[1]}`;
  const { rows, profile } = parseProfileInput(csv);
  const flags = qualityFlags(rows, profile);
  expect(flags).toContainEqual({ column: null, issue: "1 duplicate row" });
  expect(flags).toContainEqual({ column: "note", issue: expect.stringContaining("missing") });
  expect(flags).toContainEqual({ column: "revenue", issue: expect.stringContaining("1 outlier") });

  const odd = parseProfileInput("a,,c\n1,,x\n2,,x\n");
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

test("profiles an uploaded CSV file, downloaded from the job's input", async () => {
  const api = new FakePayvoke();
  const asked: string[] = [];
  api.download = async (_invocation, fileId) => {
    asked.push(fileId);
    return new TextEncoder().encode(salesCsv);
  };
  await runProfile(new Run(api, "job-1", "run-1"), { file: "f-1" }, async () => []);
  expect(asked).toEqual(["f-1"]);
  const result = api.reports.at(-1)!;
  if (result.type !== "result") throw new Error("expected result");
  expect(result.data.output).toContain("60 rows, 6 columns");
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
    // Text and a file at once is ambiguous.
    { csv: salesCsv, file: "f-1" },
  ]) {
    const api = new FakePayvoke();
    const run = new Run(api, "job-1", "run-1");
    await expect(runProfile(run, args, async () => [])).rejects.toBeInstanceOf(CsvError);
    expect(api.reports.some((r) => r.type === "result")).toBe(false);
  }
});
