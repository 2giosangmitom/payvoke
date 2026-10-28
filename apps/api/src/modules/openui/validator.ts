import {
  createLibrary,
  createParser,
  defineComponent,
  generateSystemPrompt,
  type ParseResult,
} from "@openuidev/lang-core";
import {
  OPENUI_ROOT,
  componentList,
  promptExamples,
  promptRules,
} from "@payvoke/shared/openui";

// The host library has no renderers; it only supplies the JSON Schema the
// parser validates provider programs against.
const library = createLibrary({
  root: OPENUI_ROOT,
  components: componentList.map((spec) => defineComponent({ ...spec, component: null })),
});
const parser = createParser(library.toJSONSchema(), OPENUI_ROOT);

export const OPENUI_PATCH_LIMIT = 8192;
export const OPENUI_SOURCE_LIMIT = 65536;
export const OPENUI_STATEMENT_LIMIT = 200;

// Same policy as the former A2UI data check: no markup, scripts or URL fetches
// anywhere in provider-supplied UI, even though React escapes text at render.
const UNSAFE = /<\/?[a-z][^>]*>|javascript:|data:|https?:\/\//i;
const control = (text: string) =>
  [...text].some((char) => char < " " && char !== "\n" && char !== "\r" && char !== "\t");

// Required props that are null only because their reference is not streamed
// yet are expected mid-stream; the renderer drops the node until it resolves.
const PENDING = new Set(["null-required", "missing-required"]);

export function checkOpenUIPatch(patch: unknown): asserts patch is string {
  if (typeof patch !== "string" || !patch.trim() || patch.length > OPENUI_PATCH_LIMIT)
    throw new Error("INVALID_OPENUI");
  if (UNSAFE.test(patch) || control(patch)) throw new Error("UNSAFE_OPENUI_VALUE");
}

// A surface is an append-only OpenUI Lang program: each patch adds complete
// statements, and redefining an identifier replaces it (latest wins). The
// whole program is re-parsed so a patch is rejected if it breaks the tree.
export function applyOpenUIPatch(existing: string, patch: unknown): string {
  checkOpenUIPatch(patch);
  const source = existing ? `${existing}\n${patch.trim()}` : patch.trim();
  if (source.length > OPENUI_SOURCE_LIMIT) throw new Error("OPENUI_SURFACE_TOO_LARGE");
  let result: ParseResult;
  try {
    result = parser.parse(source);
  } catch {
    throw new Error("INVALID_OPENUI");
  }
  const { meta } = result;
  if (meta.incomplete) throw new Error("INVALID_OPENUI");
  if (meta.statementCount > OPENUI_STATEMENT_LIMIT) throw new Error("OPENUI_SURFACE_TOO_LARGE");
  if (result.queryStatements.length || result.mutationStatements.length)
    throw new Error("UNSAFE_OPENUI_VALUE");
  const errors = meta.errors.filter(
    (error) =>
      error.severity !== "warning" &&
      // Children may stream before the root statement.
      error.code !== "no-root" &&
      !(meta.unresolved.length && PENDING.has(error.code)),
  );
  if (errors.some((error) => error.code === "unknown-component"))
    throw new Error("UNKNOWN_OPENUI_COMPONENT");
  if (errors.length) throw new Error("INVALID_OPENUI");
  return source;
}

export const openuiCatalog = () => ({
  root: OPENUI_ROOT,
  prompt: generateSystemPrompt({
    library: library.toSpec(),
    promptOptions: { examples: promptExamples, additionalRules: promptRules },
  }),
  schema: library.toJSONSchema(),
});
