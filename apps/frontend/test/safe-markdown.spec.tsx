import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SafeMarkdown } from "../src/components/workspace/safe-markdown";

describe("admitted Markdown subset", () => {
  it("blocks raw HTML, scripts, images, unsafe URLs, and provider components", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown
        text={
          '<script>alert(1)</script>\n\n<img src="https://tracker.test/x" onerror="alert(1)">\n\n![tracking](https://tracker.test/pixel)\n\n[unsafe](javascript:alert%281%29)\n\n<PayButton amount="100" />\n\n**Safe text**'
        }
      />,
    );
    expect(html).not.toMatch(/<script|<img|<PayButton|javascript:|onerror=|tracker.test/);
    expect(html).toContain("<strong>Safe text</strong>");
  });
  it("admits HTTPS links and leaves incomplete code as inert text", () => {
    const html = renderToStaticMarkup(
      <SafeMarkdown text={"[Source](https://example.test)\n\n```mermaid\ngraph TD; A-->B;"} />,
    );
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<pre><code class="language-mermaid">');
    expect(html).not.toContain("<svg");
  });
});
