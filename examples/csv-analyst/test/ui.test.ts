import { expect, test } from "bun:test";
// Payvoke's own ingress validator: if it accepts these patches, so does the API.
import { applyOpenUIPatch } from "../../../apps/api/src/modules/openui/validator";
import { aggregate, outliers, parseCsv, profile } from "../src/csv";
import * as ui from "../src/ui";
import { salesCsv } from "./fixtures";

const rows = parseCsv(salesCsv);
const p = profile(rows);

test("the streamed dashboard passes Payvoke's OpenUI validator", () => {
  const sections: string[] = [];
  let source = "";
  const add = (id: string, patch: string) => {
    sections.push(id);
    const full = `${patch}\n${ui.root(sections)}`;
    expect(full.length).toBeLessThanOrEqual(8192);
    source = applyOpenUIPatch(source, full);
  };
  add(
    "head",
    ui.header("head", 'Analysis of "sales.csv"', "Goal: see <script>http://evil.io</script>"),
  );
  add(
    "kpi",
    ui.metrics("kpi", [
      { label: "Rows", value: 60 },
      { label: "Missing", value: 4.5, unit: "%" },
    ]),
  );
  add(
    "ch0",
    ui.chart("ch0", "Total revenue by region", aggregate(rows, p, "region", "revenue", "sum")),
  );
  const revenue = p.columns.find((c) => c.name === "revenue")!;
  add("out", ui.outlierCard("out", "revenue", outliers(rows, revenue)));
  add("none", ui.outlierCard("none", "units", []));
  add("cols", ui.profileCard("cols", p));
});

test("a wide file still fits one patch", () => {
  const header = Array.from(
    { length: 100 },
    (_, i) => `a very long column name number ${i} with data: in it`,
  );
  const wide = profile(
    parseCsv(
      `${header.join(",")}\n${header.map((_, i) => `<i>value ${i}</i> https://example.com`).join(",")}`,
    ),
  );
  const patch = `${ui.profileCard("cols", wide)}\n${ui.root(["cols"])}`;
  expect(patch.length).toBeLessThanOrEqual(8192);
  applyOpenUIPatch("", patch);
});

test("safe() removes what Payvoke rejects", () => {
  expect(ui.safe("<b>see https://x.io or javascript:alert(1) data:x</b>")).not.toMatch(
    /<|>|https?:|javascript:|data:/i,
  );
});
