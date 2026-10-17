import { SaxesParser } from "saxes";

const namespace = "http://www.w3.org/2000/svg";
const shapes = new Set(["path", "circle", "rect", "ellipse", "line", "polyline", "polygon"]);
const elements = new Set(["svg", "g", "title", "desc", ...shapes]);
const numeric = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "stroke-width",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
]);

/** Restricted logo source, returned as code, never inserted into a page or rendered here. */
export function logoSource(output: string): string {
  const source = output
    .trim()
    .replace(/^```(?:svg|xml)?\s*\n([\s\S]*?)\n```$/i, "$1")
    .trim();
  const invalid = () => {
    throw new Error("Expected one restricted SVG logo symbol.");
  };
  if (!source || source.length > 24000 || source.includes("`")) invalid();
  const parser = new SaxesParser({ xmlns: true });
  const stack: string[] = [];
  const colors = new Set<string>();
  let roots = 0;
  let shapeCount = 0;
  let count = 0;
  parser.on("error", invalid);
  parser.on("doctype", invalid);
  parser.on("processinginstruction", invalid);
  parser.on("xmldecl", invalid);
  parser.on("cdata", invalid);
  parser.on("opentag", (tag) => {
    if (
      tag.uri !== namespace ||
      tag.prefix ||
      !elements.has(tag.local) ||
      ++count > 256 ||
      stack.length >= 16
    )
      invalid();
    if (stack.length === 0) {
      if (
        ++roots !== 1 ||
        tag.local !== "svg" ||
        tag.attributes.viewBox?.value.trim().split(/\s+/).join(" ") !== "0 0 256 256"
      )
        invalid();
    } else if (tag.local === "svg" || ["title", "desc"].includes(stack.at(-1)!)) invalid();
    if (shapes.has(tag.local)) shapeCount++;
    for (const attribute of Object.values(tag.attributes)) {
      const { name, value } = attribute;
      if (value.length > 8192) invalid();
      if (name === "xmlns" && stack.length === 0 && value === namespace) continue;
      if (attribute.prefix || attribute.uri) invalid();
      if (name === "viewBox" && stack.length === 0) continue;
      if (name === "fill" || name === "stroke") {
        if (value === "none") continue;
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) invalid();
        colors.add(
          value
            .slice(1)
            .toLowerCase()
            .replace(/^(.)(.)(.)$/, "$1$1$2$2$3$3"),
        );
        if (colors.size > 3) invalid();
      } else if (numeric.has(name)) {
        if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || Math.abs(Number(value)) > 4096)
          invalid();
      } else if (name === "d" && tag.local === "path") {
        if (!/^[MmZzLlHhVvCcSsQqTtAa0-9\s.,+-]+$/.test(value)) invalid();
      } else if (name === "points" && ["polyline", "polygon"].includes(tag.local)) {
        if (!/^[0-9\s.,+-]+$/.test(value)) invalid();
      } else if (name === "transform") {
        if (!/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9\s.,+-]+\)\s*)+$/.test(value))
          invalid();
      } else if (name === "fill-rule" || name === "clip-rule") {
        if (!["nonzero", "evenodd"].includes(value)) invalid();
      } else if (name === "stroke-linecap") {
        if (!["butt", "round", "square"].includes(value)) invalid();
      } else if (name === "stroke-linejoin") {
        if (!["miter", "round", "bevel"].includes(value)) invalid();
      } else invalid();
    }
    stack.push(tag.local);
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  parser.on("text", (text) => {
    if (text.trim() && !["title", "desc"].includes(stack.at(-1) ?? "")) invalid();
  });
  parser.write(source).close();
  if (roots !== 1 || !shapeCount) invalid();
  return `\`\`\`svg\n${source}\n\`\`\``;
}
