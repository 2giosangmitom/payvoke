import { mono, sans, T, viet } from "../lib/theme";

// 2D-canvas drawings for in-world surfaces: the hero's monitor, sticky
// notes, speech bubbles, billboards. All sized in canvas pixels.

type Ctx = CanvasRenderingContext2D;

const font = (size: number, weight = 500, family = sans) => `${weight} ${size}px ${family}`;

export function drawLogo(ctx: Ctx, x: number, y: number, size: number) {
  const u = size / 28;
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate((-8 * Math.PI) / 180);
  ctx.translate(-size / 2, -size / 2);
  const sq = (cx: number, cy: number, color: string, alpha = 1) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(cx * u, cy * u, 6 * u, 6 * u);
  };
  [
    [3, 3],
    [19, 3],
    [3, 19],
    [19, 19],
  ].forEach(([a, b]) => sq(a, b, T.logo));
  [
    [11, 3],
    [3, 11],
    [19, 11],
    [11, 19],
  ].forEach(([a, b]) => sq(a, b, T.logo, 0.18));
  sq(11, 11, T.logoLight);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export type Screen =
  | { kind: "off" }
  | { kind: "blank"; caret: boolean }
  | { kind: "progress"; pct: number; eta: string }
  | { kind: "code"; text: string }
  | { kind: "error"; n: number }
  | { kind: "ok" }
  | { kind: "console"; page: "studio" | "store" | "chat" | "home" }
  | { kind: "saver" };

export function drawScreen(ctx: Ctx, w: number, h: number, s: Screen) {
  ctx.fillStyle = s.kind === "off" ? "#050807" : T.bg;
  ctx.fillRect(0, 0, w, h);
  if (s.kind === "off") return;
  if (s.kind === "saver") {
    drawLogo(ctx, w / 2 - 60, h / 2 - 60, 120);
    return;
  }
  if (s.kind === "console") return drawConsole(ctx, w, h, s.page);
  // Editor chrome
  ctx.fillStyle = T.bgDeep;
  ctx.fillRect(0, 0, w, 44);
  [T.danger, T.warning, T.brand].forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(18 + i * 22, 15, 13, 13);
  });
  ctx.fillStyle = T.muted;
  ctx.font = font(20, 400, mono);
  ctx.fillText(s.kind === "progress" ? "doing step 1 of 100" : "idea.ts", 100, 29);
  if (s.kind === "blank") {
    ctx.fillStyle = T.muted;
    ctx.font = font(30, 400, mono);
    ctx.fillText("// TODO: everything", 40, 110);
    if (s.caret) {
      ctx.fillStyle = T.brand;
      ctx.fillRect(40, 140, 16, 34);
    }
  }
  if (s.kind === "progress") {
    ctx.fillStyle = T.text;
    ctx.font = font(44, 700, mono);
    ctx.fillText(`${s.pct.toFixed(1)}%`, 40, 150);
    ctx.fillStyle = T.bgDeep;
    ctx.fillRect(40, 190, w - 80, 40);
    ctx.fillStyle = T.brand;
    ctx.fillRect(40, 190, ((w - 80) * s.pct) / 100, 40);
    ctx.fillStyle = T.muted;
    ctx.font = font(28, 400, mono);
    ctx.fillText(s.eta, 40, 290);
  }
  if (s.kind === "code") {
    ctx.font = font(26, 400, mono);
    s.text.split("\n").forEach((line, i) => {
      ctx.fillStyle = line.trim().startsWith("//")
        ? T.muted
        : /export|const|return|await/.test(line)
          ? T.brand
          : T.text;
      ctx.fillText(line, 32, 100 + i * 40);
    });
  }
  if (s.kind === "error") {
    ctx.fillStyle = "#3a1518";
    ctx.fillRect(0, 44, w, h - 44);
    ctx.fillStyle = T.danger;
    ctx.font = font(64, 800);
    ctx.fillText(s.n > 1 ? "BROKE AGAIN" : "ERROR", 40, 160);
    ctx.font = font(24, 400, mono);
    ctx.fillText(
      s.n > 1 ? "RangeError: call stack exceeded" : "TypeError: steps.map is not a function",
      40,
      220,
    );
  }
  if (s.kind === "ok") {
    ctx.fillStyle = T.brandSoft;
    ctx.fillRect(0, 44, w, h - 44);
    ctx.fillStyle = T.brand;
    ctx.font = font(72, 800);
    ctx.fillText("✓ IT WORKS", 40, 175);
    ctx.font = font(26, 400, mono);
    ctx.fillStyle = T.text2;
    ctx.fillText("42 tests passed", 44, 235);
  }
}

function drawConsole(ctx: Ctx, w: number, h: number, page: "studio" | "store" | "chat" | "home") {
  // Rail
  ctx.fillStyle = T.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = T.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 0, 0, h);
  drawLogo(ctx, 12, 12, 32);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i === (page === "studio" ? 4 : page === "chat" ? 1 : 0) ? T.text : T.muted;
    ctx.fillRect(20, 80 + i * 44, 16, 16);
  }
  // Top bar
  ctx.beginPath();
  ctx.moveTo(56, 52);
  ctx.lineTo(w, 52);
  ctx.stroke();
  ctx.fillStyle = T.muted;
  ctx.font = font(20);
  ctx.fillText(
    `Console  ›  ${page === "studio" ? "Studio" : page === "chat" ? "Chat" : page === "home" ? "Home" : "Store"}`,
    76,
    33,
  );
  const x0 = 80;
  if (page === "home") {
    ctx.fillStyle = T.text;
    ctx.font = font(32, 600);
    ctx.fillText("Good evening, Chiến", x0, 100);
    // figure strip
    const fw = (w - x0 - 40) / 4;
    ["7.50", "46.20", "2.50", "21"].forEach((v, i) => {
      ctx.strokeStyle = T.border;
      ctx.strokeRect(x0 + i * fw, 125, fw, 80);
      ctx.fillStyle = T.muted;
      ctx.font = font(14);
      ctx.fillText(
        ["Held for jobs", "Paid to agents", "Refunded", "Jobs hired"][i],
        x0 + i * fw + 12,
        148,
      );
      ctx.fillStyle = T.text;
      ctx.font = font(28, 400, mono);
      ctx.fillText(v, x0 + i * fw + 12, 188);
    });
    // the earnings area chart
    const cx = x0;
    const cy = 235;
    const cw = w - x0 - 40;
    const ch = h - cy - 30;
    ctx.strokeStyle = T.border;
    ctx.strokeRect(cx, cy, cw, ch);
    const pts = Array.from(
      { length: 30 },
      (_, i) => 4 + i * i * 0.09 + (i > 24 ? (i - 24) * 9 : 0),
    );
    const max = Math.max(...pts);
    const px = (i: number) => cx + 20 + (i / 29) * (cw - 40);
    const py = (v: number) => cy + ch - 20 - (v / max) * (ch - 50);
    const g = ctx.createLinearGradient(0, cy, 0, cy + ch);
    g.addColorStop(0, "rgba(140,190,162,0.45)");
    g.addColorStop(1, "rgba(140,190,162,0.02)");
    ctx.beginPath();
    pts.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.lineTo(px(29), cy + ch - 20);
    ctx.lineTo(px(0), cy + ch - 20);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    pts.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.strokeStyle = T.brand;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  if (page === "store") {
    ctx.fillStyle = T.text;
    ctx.font = font(34, 600);
    ctx.fillText("AI agents you can hire", x0, 105);
    const cw = (w - x0 - 40 - 24) / 3;
    for (let i = 0; i < 6; i++) {
      const cx = x0 + (i % 3) * (cw + 12);
      const cy = 130 + Math.floor(i / 3) * 150;
      ctx.fillStyle = T.surface;
      ctx.fillRect(cx, cy, cw, 138);
      ctx.strokeStyle = i === 0 ? T.brand : T.border;
      ctx.strokeRect(cx, cy, cw, 138);
      ctx.fillStyle = T.brandSoft;
      ctx.fillRect(cx + 14, cy + 14, 34, 34);
      ctx.fillStyle = T.text;
      ctx.font = font(20, 600);
      ctx.fillText(
        ["Jingle Bot", "CSV Analyst", "Logo Smith", "Bug Whisperer", "Tax Goblin", "Pixel Cat"][i],
        cx + 14,
        cy + 78,
      );
      ctx.fillStyle = T.brand;
      ctx.font = font(15, 400, mono);
      ctx.fillText("up to $5 / job", cx + 14, cy + 118);
    }
  }
  if (page === "studio") {
    ctx.fillStyle = T.text;
    ctx.font = font(36, 600);
    ctx.fillText("Jingle Bot", x0 + 60, 112);
    ctx.fillStyle = T.brandSoft;
    ctx.fillRect(x0, 80, 46, 46);
    ["Name", "Description"].forEach((label, i) => {
      ctx.fillStyle = T.text2;
      ctx.font = font(18);
      ctx.fillText(label, x0, 175 + i * 100);
      ctx.strokeStyle = T.borderStrong;
      ctx.strokeRect(x0, 188 + i * 100, w - x0 - 40, 48);
      ctx.fillStyle = T.text;
      ctx.font = font(20);
      ctx.fillText(
        i ? "Writes a catchy jingle for anything you sell." : "Jingle Bot",
        x0 + 14,
        219 + i * 100,
      );
    });
    ctx.fillStyle = T.brand;
    ctx.fillRect(w - 260, h - 80, 220, 50);
    ctx.fillStyle = T.brandInk;
    ctx.font = font(20, 600);
    ctx.fillText("Publish to store →", w - 245, h - 48);
  }
  if (page === "chat") {
    ctx.fillStyle = T.surface2;
    ctx.fillRect(w - 470, 80, 420, 60);
    ctx.fillStyle = T.text;
    ctx.font = font(19);
    ctx.fillText("Can you write a jingle for my shop?", w - 455, 117);
    ctx.strokeStyle = T.borderStrong;
    ctx.strokeRect(x0, 170, 420, 200);
    ctx.fillStyle = T.text;
    ctx.font = font(44, 600, mono);
    ctx.fillText("$2.50 / job", x0 + 20, 240);
    ctx.fillStyle = T.brand;
    ctx.fillRect(x0 + 220, 310, 180, 44);
    ctx.fillStyle = T.brandInk;
    ctx.font = font(18, 600);
    ctx.fillText("Accept and pay", x0 + 238, 339);
  }
}

/** A square sticky note with a handwritten-ish line or two. */
export function drawNote(ctx: Ctx, w: number, h: number, text: string, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#00000022";
  ctx.fillRect(0, 0, w, 14);
  ctx.fillStyle = "#2a2a2a";
  ctx.font = font(26, 600);
  const words = text.split(" ");
  let line = "";
  let y = 56;
  for (const word of words) {
    if (ctx.measureText(`${line} ${word}`).width > w - 28 && line) {
      ctx.fillText(line, 14, y);
      y += 32;
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  ctx.fillText(line, 14, y);
}

/** Rounded speech bubble with lines of text. */
export function drawBubble(
  ctx: Ctx,
  w: number,
  h: number,
  lines: string[],
  opts: { mono?: boolean; accent?: boolean } = {},
) {
  ctx.clearRect(0, 0, w, h);
  const r = 26;
  ctx.fillStyle = opts.accent ? T.brand : "#f6f5ea";
  ctx.beginPath();
  ctx.roundRect(4, 4, w - 8, h - 50, r);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h - 48);
  ctx.lineTo(w * 0.24, h - 6);
  ctx.lineTo(w * 0.42, h - 48);
  ctx.fill();
  ctx.fillStyle = opts.accent ? T.brandInk : "#1d2a24";
  const size = Math.min(52, (h - 80) / lines.length - 6);
  ctx.font = font(size, opts.mono ? 600 : 700, opts.mono ? mono : viet);
  lines.forEach((l, i) => ctx.fillText(l, 30, 30 + size + i * (size + 10)));
}

/** A neon billboard. */
export function drawBillboard(ctx: Ctx, w: number, h: number, text: string, sub = "") {
  ctx.fillStyle = "#08100c";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = T.brand;
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.shadowColor = T.brand;
  ctx.shadowBlur = 30;
  ctx.fillStyle = T.logoLight;
  let size = 150;
  ctx.font = font(size, 800);
  while (ctx.measureText(text).width > w - 120 && size > 40) {
    size -= 6;
    ctx.font = font(size, 800);
  }
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2 + size * 0.3 - (sub ? 30 : 0));
  if (sub) {
    ctx.shadowBlur = 0;
    ctx.fillStyle = T.text2;
    ctx.font = font(46, 500, mono);
    ctx.fillText(sub, w / 2, h - 70);
  }
  ctx.textAlign = "left";
  ctx.shadowBlur = 0;
}
