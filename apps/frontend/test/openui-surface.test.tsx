import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenUISurface, surfaceQuestionIds } from "@/src/features/chat/openui-surface";
import type { ChatQuestion } from "@/src/features/chat/api";

const question = (overrides: Partial<ChatQuestion> = {}): ChatQuestion => ({
  id: "q1",
  invocationId: "i1",
  questionId: "format",
  prompt: "Which format?",
  inputSchema: {
    type: "object",
    required: ["format"],
    properties: { format: { type: "string", enum: ["md", "txt"] } },
  },
  chatTextParameter: null,
  status: "OPEN",
  createdAt: "2026-10-23T00:00:00.000Z",
  answeredAt: null,
  ...overrides,
});
const form = ["root = Stack([form])", 'form = QuestionForm("format", "Pick a format")'].join("\n");

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
  assert.match(html, /OpenUI Lang/);
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

it("nests cards and places an open question form inline", () => {
  const html = renderToStaticMarkup(
    <OpenUISurface
      invocationId="i1"
      questions={[question()]}
      onAnswer={async () => {}}
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
  assert.match(html, /Pick a format/);
  assert.match(html, /Which format\?/);
  assert.match(html, /Send answer/);
  assert.deepEqual(surfaceQuestionIds(form), ["format"]);
  assert.deepEqual(surfaceQuestionIds("not openui"), []);
});

it("does not offer an answer for a closed or foreign question", () => {
  for (const [invocationId, status] of [
    ["i1", "ANSWERED"],
    ["i2", "OPEN"],
  ]) {
    const html = renderToStaticMarkup(
      <OpenUISurface
        invocationId={invocationId}
        questions={[question({ status })]}
        onAnswer={async () => {}}
        source={form}
      />,
    );
    assert.doesNotMatch(html, /Send answer/);
    assert.match(html, /no longer open/);
  }
});
