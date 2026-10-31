import assert from "node:assert/strict";
import { it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenUISurface } from "@/src/features/chat/openui-surface";

it("renders an OpenUI Lang program with the latest definition of each statement", () => {
  const html = renderToStaticMarkup(
    <OpenUISurface
      source={[
        "root = Stack([summary, score, regions, trend])",
        'summary = Text("Draft")',
        'score = Metric("Score", 90, "/100")',
        'regions = Table(["region", "total"], [{region: "EU", total: 120}])',
        'trend = Chart([{label: "Jan", value: 4}], "Trend")',
        'summary = Text("Updated as statements arrive")',
      ].join("\n")}
    />,
  );
  assert.match(html, /Live view from the agent/);
  assert.match(html, /Updated as statements arrive/);
  assert.doesNotMatch(html, /Draft/);
  assert.match(html, /Score/);
  assert.match(html, />90</);
  assert.match(html, /<th[^>]*>region<\/th>/);
  assert.match(html, /<td[^>]*>120<\/td>/);
  assert.match(html, /aria-label="Trend"/);
});

it("renders a partially streamed program and drops unknown components", () => {
  const partial = renderToStaticMarkup(
    <OpenUISurface source={'root = Stack([summary, later])\nsummary = Text("So far")'} />,
  );
  assert.match(partial, /So far/);
  const html = renderToStaticMarkup(
    <OpenUISurface
      source={'root = Stack([x, ok])\nx = script("alert(1)")\nok = Text("<b>plain</b>")'}
    />,
  );
  assert.doesNotMatch(html, /<script|alert\(1\)/);
  // Provider strings are React text, never markup.
  assert.match(html, /&lt;b&gt;plain&lt;\/b&gt;/);
});

it("nests cards and drops the removed question slot", () => {
  const html = renderToStaticMarkup(
    <OpenUISurface
      source={[
        "root = Stack([result, form])",
        'result = Card("Result", "Summary", [nested])',
        'nested = Text("Nested text")',
        'form = QuestionForm("format", "Pick a format")',
      ].join("\n")}
    />,
  );
  assert.match(html, /<h3[^>]*>Result<\/h3>/);
  assert.match(html, /Nested text/);
  // Tools are message parts now; a surface cannot open a form.
  assert.doesNotMatch(html, /Pick a format/);
});
