import { describe, expect, it } from "vitest";
import { logoSource } from "../src/logo-source.js";

const wrap = (content: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">${content}</svg>`;
describe("logo source boundary", () => {
  it("returns exactly one logo as inert fenced SVG source", () => {
    const svg = wrap('<path d="M20 20 L128 220 L236 20 Z" fill="#123456"/>');
    expect(logoSource(svg)).toBe(`\`\`\`svg\n${svg}\n\`\`\``);
    expect(logoSource(logoSource(svg))).toBe(logoSource(svg));
  });
  it("rejects prose, multiple logos, malformed XML, empty symbols and unsupported resources", () => {
    for (const source of [
      "A logo design brief instead of a logo",
      wrap(""),
      wrap('<path d="M0 0"/>') + wrap('<path d="M0 0"/>'),
      wrap('<path d="M0 0">'),
      wrap('<svg><circle r="4"/></svg>'),
      wrap("<script>alert(1)</script>"),
      wrap('<image href="https://tracker.example.com/x"/>'),
      wrap("<foreignObject><p>html</p></foreignObject>"),
      wrap('<circle r="4" onclick="alert(1)"/>'),
      wrap('<circle r="4" fill="url(https://tracker.example.com)"/>'),
      wrap('<circle r="4" style="fill:red"/>'),
      wrap("<text>Fonts not supported</text>"),
      '<!DOCTYPE svg [<!ENTITY secret SYSTEM "file:///etc/passwd">]>' +
        wrap('<title>&secret;</title><circle r="4"/>'),
      '<?xml version="1.0"?>' + wrap('<circle r="4"/>'),
      wrap('<title>```</title><circle r="4"/>'),
    ])
      expect(() => logoSource(source), source).toThrow();
  });
  it("bounds source size, geometry count and color count", () => {
    expect(() => logoSource(wrap('<circle r="4"/>'.repeat(257)))).toThrow();
    expect(() => logoSource(wrap(" ".repeat(24000) + '<circle r="4"/>'))).toThrow();
    expect(() =>
      logoSource(
        wrap(
          ["#111", "#222", "#333", "#444"]
            .map((color) => `<circle r="4" fill="${color}"/>`)
            .join(""),
        ),
      ),
    ).toThrow();
  });
});
