import { readFile } from "node:fs/promises";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Review } from "./review";
import { CvError } from "./document";

const FONT_ROOT = new URL("../assets/fonts/", import.meta.url);
const WIDTH = 595.28,
  HEIGHT = 841.89,
  MARGIN = 46;

// Return layout metrics as well as bytes so tests can check every line's bounds.
export type PdfLine = {
  page: number;
  x: number;
  y: number;
  width: number;
  size: number;
  text: string;
};

export async function renderPdf(
  cv: Review["cv"],
): Promise<{ bytes: Uint8Array<ArrayBuffer>; lines: PdfLine[] }> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regularBytes, boldBytes] = await Promise.all([
    readFile(new URL("NotoSans-Regular.ttf", FONT_ROOT)),
    readFile(new URL("NotoSans-Bold.ttf", FONT_ROOT)),
  ]);
  const regular = await document.embedFont(regularBytes, { subset: true });
  const bold = await document.embedFont(boldBytes, { subset: true });
  const supported = new Set(regular.getCharacterSet());
  const supportedBold = new Set(bold.getCharacterSet());
  const lines: PdfLine[] = [];
  let page: PDFPage;
  let y = HEIGHT - MARGIN;
  let pageNumber = 0;
  function newPage() {
    page = document.addPage([WIDTH, HEIGHT]);
    pageNumber++;
    y = HEIGHT - MARGIN;
  }
  newPage();

  function wrap(text: string, font: PDFFont, size: number): string[] {
    const result: string[] = [];
    for (const paragraph of text.normalize("NFC").split(/\r?\n/)) {
      let line = "";
      for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
        const candidate = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= WIDTH - MARGIN * 2) {
          line = candidate;
          continue;
        }
        if (line) result.push(line);
        line = "";
        // Wrap long URLs/words by Unicode code point without clipping them.
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > WIDTH - MARGIN * 2) {
            result.push(line);
            line = char;
          } else line += char;
        }
      }
      if (line) result.push(line);
    }
    return result;
  }

  function draw(text: string, style: "body" | "heading" | "name" = "body") {
    const heading = style === "heading";
    const emphasized = style !== "body";
    const font = emphasized ? bold : regular;
    const charset = emphasized ? supportedBold : supported;
    const normalized = text.normalize("NFC");
    if ([...normalized].some((char) => !/\s/.test(char) && !charset.has(char.codePointAt(0)!))) {
      throw new CvError(
        "unsupported_glyph",
        "CV chứa ký tự chưa được font PDF hỗ trợ. Vui lòng gửi bản tiếng Việt hoặc tiếng Anh.",
      );
    }
    const size = style === "name" ? 20 : heading ? 13 : 10.5;
    const lineHeight = style === "name" ? 28 : heading ? 19 : 15;
    const wrapped = wrap(normalized, font, size);
    // Keep a heading with at least the first two lines of its content.
    if (heading && y - lineHeight - 30 < MARGIN) newPage();
    for (const text of wrapped) {
      if (y - lineHeight < MARGIN) newPage();
      y -= lineHeight;
      page.drawText(text, {
        x: MARGIN,
        y,
        font,
        size,
        color: heading ? rgb(0.1, 0.19, 0.3) : rgb(0.12, 0.12, 0.12),
      });
      lines.push({
        page: pageNumber,
        x: MARGIN,
        y,
        width: font.widthOfTextAtSize(text, size),
        size,
        text,
      });
    }
    y -= heading ? 4 : 7;
  }
  for (const [sectionIndex, section] of cv.sections.entries()) {
    if (section.title) draw(section.title, "heading");
    for (const [itemIndex, item] of section.items.entries()) {
      // Emphasize a short name line; flattened PDF paragraphs stay body text.
      const name =
        sectionIndex === 0 &&
        itemIndex === 0 &&
        item.text.length < 100 &&
        !/[\d@\n]|https?:/i.test(item.text);
      draw(item.text, name ? "name" : "body");
    }
    y -= 5;
  }
  document.setTitle(cv.language === "vi" ? "CV đã cải thiện" : "Improved CV");
  document.setProducer("Payvoke CV Reviewer");
  document.setLanguage(cv.language);
  return { bytes: new Uint8Array(await document.save()), lines };
}
