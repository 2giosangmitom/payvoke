import assert from "node:assert/strict";
import { it } from "node:test";
import { applyOpenUIPatch, openuiCatalog } from "../src/modules/openui/validator";
import { validateEvent } from "../src/modules/runs/protocol";

const rejects = (existing: string, patch: unknown, code: string) =>
  assert.throws(() => applyOpenUIPatch(existing, patch), { message: code }, String(patch));

it("accumulates OpenUI Lang statements with forward references and redefinition", () => {
  let source = applyOpenUIPatch("", "root = Stack([summary, score])");
  // Children may arrive before their own references resolve.
  source = applyOpenUIPatch(source, 'summary = Text("Draft")\nscore = Metric("Score", total)');
  source = applyOpenUIPatch(source, "total = 90");
  source = applyOpenUIPatch(source, 'summary = Text("Final", "heading")');
  assert.equal(source.split("\n").length, 5);
  // Statements may span lines inside brackets, and children may precede root.
  assert.ok(applyOpenUIPatch("", 'rows = Table(["a"], [\n  {a: 1},\n  {a: 2}\n])'));
  assert.ok(applyOpenUIPatch("", 'q = QuestionForm("region", "Pick a region")'));
});

it("rejects components, tool calls and content outside the display-only catalog", () => {
  const root = "root = Stack([a])";
  rejects(root, 'a = Iframe("x")', "UNKNOWN_OPENUI_COMPONENT");
  rejects(root, 'a = Query("list_users", {})', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Mutation("delete_user", {})', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Text("<img src=x onerror=alert(1)>")', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Text("javascript:alert(1)")', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Text("see https://example.com")', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Text("bell\u0007")', "UNSAFE_OPENUI_VALUE");
  rejects(root, 'a = Text("x", "body", "extra")', "INVALID_OPENUI");
  rejects(root, 'a = Metric("Score")', "INVALID_OPENUI");
  rejects(root, 'a = Text(@Fetch("x"))', "INVALID_OPENUI");
  rejects(root, 'a = Text("unterminated', "INVALID_OPENUI");
  rejects(root, "", "INVALID_OPENUI");
  rejects(root, 42, "INVALID_OPENUI");
  rejects(root, `a = Text("${"x".repeat(9000)}")`, "INVALID_OPENUI");
  let big = root;
  for (let i = 0; i < 8; i++) big = applyOpenUIPatch(big, `a = Text("${"x".repeat(8000)}")`);
  rejects(big, `a = Text("${"x".repeat(8000)}")`, "OPENUI_SURFACE_TOO_LARGE");
});

it("accepts only the payvoke.openui custom event shape at ingress", () => {
  const event = (value: unknown) => ({ type: "CUSTOM", name: "payvoke.openui", value });
  assert.ok(validateEvent(event({ surfaceId: "result", source: 'a = Text("x")' })));
  for (const value of [
    { surfaceId: "bad id", source: 'a = Text("x")' },
    { surfaceId: "result", source: 'a = Text("x")', html: "<b>" },
    { surfaceId: "result" },
  ])
    assert.throws(() => validateEvent(event(value)), { message: "INVALID_OPENUI" });
  assert.throws(() => validateEvent({ type: "CUSTOM", name: "payvoke.a2ui", value: {} }), {
    message: "INVALID_AGUI_EVENT",
  });
});

it("publishes a provider prompt generated from the shared catalog", () => {
  const { root, prompt, schema } = openuiCatalog();
  assert.equal(root, "Stack");
  for (const name of ["Stack", "Text", "Card", "Metric", "Table", "Chart", "QuestionForm"])
    assert.match(prompt, new RegExp(`${name}\\(`));
  assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), [
    "Card",
    "Chart",
    "Metric",
    "QuestionForm",
    "Stack",
    "Table",
    "Text",
  ]);
});
