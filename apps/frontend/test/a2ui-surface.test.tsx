import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A2uiSurface } from "../src/components/a2ui-surface";

it("renders allowlisted A2UI v0.9.1 surfaces and data-bound widgets", () => {
  const html = renderToStaticMarkup(
    <A2uiSurface
      operations={[
        {
          version: "v0.9.1",
          createSurface: { surfaceId: "result", catalogId: "https://payvoke.dev/a2ui/catalog/v1" },
        },
        {
          version: "v0.9.1",
          updateComponents: {
            surfaceId: "result",
            components: [
              { id: "summary", component: "Text", text: { path: "/summary" } },
              { id: "value", component: "Metric", label: "Score", value: { path: "/score" } },
            ],
          },
        },
        {
          version: "v0.9.1",
          updateDataModel: {
            surfaceId: "result",
            path: "/summary",
            value: "Updated as tokens arrive",
          },
        },
        { version: "v0.9.1", updateDataModel: { surfaceId: "result", path: "/score", value: 90 } },
      ]}
    />,
  );
  assert.match(html, /Updated as tokens arrive/);
  assert.match(html, /Score/);
  assert.match(html, />90</);
});

it("drops unknown catalog and never executes arbitrary provider components", () => {
  assert.equal(
    renderToStaticMarkup(
      <A2uiSurface
        operations={[
          {
            version: "v0.9.1",
            createSurface: { surfaceId: "x", catalogId: "https://provider.invalid" },
          },
          {
            version: "v0.9.1",
            updateComponents: {
              surfaceId: "x",
              components: [{ id: "z", component: "script", text: "alert(1)" }],
            },
          },
        ]}
      />,
    ),
    "",
  );
});

it("rejects dangerous data paths without altering object prototypes", () => {
  const html = renderToStaticMarkup(
    <A2uiSurface
      operations={[
        {
          version: "v0.9.1",
          createSurface: { surfaceId: "safe", catalogId: "https://payvoke.dev/a2ui/catalog/v1" },
        },
        {
          version: "v0.9.1",
          updateComponents: {
            surfaceId: "safe",
            components: [{ id: "text", component: "Text", text: { path: "/__proto__/polluted" } }],
          },
        },
        {
          version: "v0.9.1",
          updateDataModel: { surfaceId: "safe", path: "/__proto__/polluted", value: true },
        },
      ]}
    />,
  );
  assert.equal(html, "");
  assert.equal((Object.prototype as Record<string, unknown>).polluted, undefined);
});

it("renders A2UI parent/child trees and an open QuestionForm", () => {
  const html = renderToStaticMarkup(
    <A2uiSurface
      invocationId="i1"
      questions={[
        {
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
        },
      ]}
      onAnswer={async () => {}}
      operations={[
        {
          version: "v0.9.1",
          createSurface: { surfaceId: "tree", catalogId: "https://payvoke.dev/a2ui/catalog/v1" },
        },
        {
          version: "v0.9.1",
          updateComponents: {
            surfaceId: "tree",
            components: [
              { id: "root", component: "Card", title: "Result", child: "summary" },
              { id: "summary", component: "Text", text: { path: "/summary" } },
              { id: "form", component: "QuestionForm", questionId: "format" },
            ],
          },
        },
        {
          version: "v0.9.1",
          updateDataModel: { surfaceId: "tree", path: "/summary", value: "Nested text" },
        },
      ]}
    />,
  );
  assert.match(html, /Nested text/);
  assert.match(html, /Which format\?/);
  assert.match(html, /Select…/);
  assert.match(html, /Send answer/);
});

it("does not render an action for a closed A2UI question", () => {
  const html = renderToStaticMarkup(
    <A2uiSurface
      invocationId="i1"
      questions={[
        {
          id: "q1",
          invocationId: "i1",
          questionId: "format",
          prompt: "Which format?",
          inputSchema: { type: "object", properties: {} },
          chatTextParameter: null,
          status: "ANSWERED",
          createdAt: "2026-10-23T00:00:00.000Z",
          answeredAt: "2026-10-23T00:01:00.000Z",
        },
      ]}
      onAnswer={async () => {}}
      operations={[
        {
          version: "v0.9.1",
          createSurface: { surfaceId: "tree", catalogId: "https://payvoke.dev/a2ui/catalog/v1" },
        },
        {
          version: "v0.9.1",
          updateComponents: {
            surfaceId: "tree",
            components: [{ id: "form", component: "QuestionForm", questionId: "format" }],
          },
        },
      ]}
    />,
  );
  assert.doesNotMatch(html, /Send answer/);
  assert.match(html, /no longer open/);
});

it("does not answer a question owned by another invocation", () => {
  const html = renderToStaticMarkup(
    <A2uiSurface
      invocationId="i2"
      questions={[
        {
          id: "q1",
          invocationId: "i1",
          questionId: "format",
          prompt: "Which format?",
          inputSchema: { type: "object", properties: {} },
          chatTextParameter: null,
          status: "OPEN",
          createdAt: "2026-10-23T00:00:00.000Z",
          answeredAt: null,
        },
      ]}
      onAnswer={async () => {}}
      operations={[
        {
          version: "v0.9.1",
          createSurface: { surfaceId: "tree", catalogId: "https://payvoke.dev/a2ui/catalog/v1" },
        },
        {
          version: "v0.9.1",
          updateComponents: {
            surfaceId: "tree",
            components: [{ id: "form", component: "QuestionForm", questionId: "format" }],
          },
        },
      ]}
    />,
  );
  assert.doesNotMatch(html, /Send answer/);
  assert.match(html, /no longer open/);
});
