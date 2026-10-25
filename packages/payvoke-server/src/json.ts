import { parseTree, type Node, type ParseError } from "jsonc-parser";
import { canonicalSnapshot } from "@payvoke/protocol";

// Financial JSON boundaries must reject duplicate keys before normalization.
// Kept separate from Better Auth's native request parser.
export function parseFinancialJson(text: string) {
  const errors: ParseError[] = [];
  const tree = parseTree(text, errors, { disallowComments: true, allowTrailingComma: false });
  if (!tree || errors.length) throw new Error("Invalid JSON");
  function visit(node: Node, depth: number) {
    if (depth > 64) throw new Error("JSON nesting limit");
    if (node.type === "object") {
      const names = new Set<string>();
      for (const property of node.children ?? []) {
        const name = property.children![0].value as string;
        if (names.has(name)) throw new Error("Duplicate JSON key");
        names.add(name);
      }
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  }
  visit(tree, 0);
  const value = JSON.parse(text);
  canonicalSnapshot(value);
  return value;
}
