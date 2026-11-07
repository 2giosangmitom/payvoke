import { rand } from "./stage";

// What you see through each shop's open front, drawn to match its sign:
// a noodle shop has tables, stools and a steaming pot, a barber a mirror
// and chair, a pharmacy white shelves and a green cross, and so on.
// Index = the shop's sign (SIGNS in hue.tsx); the seed varies colours.

type Ctx = CanvasRenderingContext2D;

export type ShopKind =
  | "cafe"
  | "noodles"
  | "grocery"
  | "hats"
  | "dessert"
  | "bakery"
  | "bikes"
  | "gold"
  | "barber"
  | "pharmacy"
  | "candy"
  | "tea"
  | "print";

/** Shop kind for each SIGNS index. */
export const KIND_BY_SIGN: ShopKind[] = [
  "cafe",
  "noodles",
  "noodles",
  "noodles",
  "grocery",
  "hats",
  "dessert",
  "bakery",
  "bikes",
  "gold",
  "barber",
  "pharmacy",
  "candy",
  "tea",
  "print",
  "noodles",
];

const WALLS: Record<ShopKind, string> = {
  cafe: "#6b4a33",
  noodles: "#e9d8b4",
  grocery: "#d9d2c0",
  hats: "#a8794f",
  dessert: "#f4d6e0",
  bakery: "#f2d29b",
  bikes: "#5c5f66",
  gold: "#7a1f1f",
  barber: "#dfe7ea",
  pharmacy: "#f4f7f4",
  candy: "#f1d48a",
  tea: "#c9e4d6",
  print: "#e4e8ee",
};

function light(ctx: Ctx, w: number, h: number, warm = true) {
  const g = ctx.createRadialGradient(w / 2, 0, 8, w / 2, h * 0.2, w * 0.75);
  g.addColorStop(0, warm ? "rgba(255,226,160,0.75)" : "rgba(235,250,255,0.7)");
  g.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}
const floor = (ctx: Ctx, w: number, h: number, c = "#3a2a20") => {
  ctx.fillStyle = c;
  ctx.fillRect(0, h - 26, w, 26);
};
const stool = (ctx: Ctx, x: number, y: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x - 7, y - 16, 14, 16);
  ctx.fillRect(x - 9, y - 18, 18, 4);
};
const shelf = (ctx: Ctx, x: number, y: number, w: number, c = "#6b4a33") => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, 4);
};

export function drawShop(ctx: Ctx, w: number, h: number, kind: ShopKind, seed: number) {
  const r = (k: number) => rand(seed * 7.1 + k);
  ctx.fillStyle = WALLS[kind];
  ctx.fillRect(0, 0, w, h);
  switch (kind) {
    case "noodles": {
      // menu board, a steaming pot on the counter, low tables and stools
      ctx.fillStyle = "#c1121f";
      ctx.fillRect(20, 14, 90, 34);
      ctx.fillStyle = "#ffd60a";
      for (let i = 0; i < 3; i++) ctx.fillRect(28, 20 + i * 9, 60 - i * 10, 4);
      ctx.fillStyle = "#9aa0a6";
      ctx.fillRect(170, 60, 60, 46);
      ctx.fillStyle = "#c0c4c8";
      ctx.fillRect(166, 56, 68, 8);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 3; i++) ctx.fillRect(180 + i * 14, 28 + (i % 2) * 6, 5, 24);
      for (let t = 0; t < 2; t++) {
        const x = 50 + t * 80;
        ctx.fillStyle = ["#e63946", "#1d6fa3", "#2a9d8f"][(t + seed) % 3];
        ctx.fillRect(x - 24, 108, 48, 6);
        ctx.fillRect(x - 3, 114, 6, 18);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(x - 8, 106, 6, Math.PI, 0);
        ctx.arc(x + 10, 106, 6, Math.PI, 0);
        ctx.fill();
        stool(ctx, x - 30, 134, "#1d6fa3");
        stool(ctx, x + 30, 134, "#e63946");
      }
      break;
    }
    case "cafe": {
      // a counter with a phin rack, a chalk menu, hanging bulbs
      ctx.fillStyle = "#2b2d2f";
      ctx.fillRect(150, 16, 86, 50);
      ctx.fillStyle = "#f3efe6";
      for (let i = 0; i < 4; i++) ctx.fillRect(158, 24 + i * 10, 50 - (i % 2) * 14, 3);
      ctx.fillStyle = "#3a2418";
      ctx.fillRect(14, 84, 120, 50);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = "#c0c4c8";
        ctx.fillRect(22 + i * 18, 72, 10, 12);
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = "#ffe08a";
        ctx.beginPath();
        ctx.arc(40 + i * 60, 18, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      stool(ctx, 170, 134, "#e63946");
      stool(ctx, 210, 134, "#2a9d8f");
      break;
    }
    case "grocery": {
      const goods = ["#e63946", "#ffd166", "#06d6a0", "#118ab2", "#f78c6b", "#ffffff"];
      for (let s = 0; s < 3; s++) {
        const y = 28 + s * 36;
        shelf(ctx, 8, y + 26, w - 16);
        for (let x = 12; x < w - 16; x += 11) {
          ctx.fillStyle = goods[Math.floor(r(x + s * 50) * goods.length)];
          ctx.fillRect(x, y + 6 + r(x * 3 + s) * 6, 9, 20 - r(x + s) * 6);
        }
      }
      // sacks of rice in front
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = "#efe6d2";
        ctx.fillRect(30 + i * 50, 112, 34, 22);
      }
      break;
    }
    case "hats": {
      // conical hats stacked and hung on the wall
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 6; i++) {
          const x = 24 + i * 40 + (row % 2) * 20;
          const y = 30 + row * 36;
          ctx.fillStyle = r(i + row * 9) > 0.8 ? "#f4a6b8" : "#e9d9a6";
          ctx.beginPath();
          ctx.moveTo(x - 18, y + 12);
          ctx.lineTo(x, y - 10);
          ctx.lineTo(x + 18, y + 12);
          ctx.fill();
        }
      break;
    }
    case "dessert": {
      // a glass case of colourful chè in jars
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(16, 66, w - 32, 60);
      const c = ["#06d6a0", "#ffd166", "#ef476f", "#9b5de5", "#f78c6b", "#ffffff", "#2a9d8f"];
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = c[i % c.length];
        ctx.fillRect(24 + i * 22, 80, 16, 36);
      }
      ctx.fillStyle = "#ef476f";
      ctx.fillRect(40, 18, 170, 26);
      break;
    }
    case "bakery": {
      // baguettes in a glass cart
      ctx.fillStyle = "#c9d6dc";
      ctx.fillRect(40, 56, 170, 70);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = "#d4954a";
        ctx.beginPath();
        ctx.ellipse(70 + (i % 3) * 52, 78 + Math.floor(i / 3) * 16, 22, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#c1121f";
      ctx.fillRect(40, 40, 170, 14);
      break;
    }
    case "bikes": {
      // tyres on the wall, a scooter on the stand, tools
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = "#151515";
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(30 + i * 46, 36, 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = ["#e63946", "#3a86ff", "#ffd166"][seed % 3];
      ctx.fillRect(70, 92, 100, 28);
      ctx.fillStyle = "#151515";
      ctx.beginPath();
      ctx.arc(80, 124, 12, 0, Math.PI * 2);
      ctx.arc(160, 124, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c0c4c8";
      for (let i = 0; i < 5; i++) ctx.fillRect(196 + i * 9, 70, 4, 30);
      floor(ctx, w, h, "#2a2c30");
      return;
    }
    case "gold": {
      // a glass counter glittering with gold and a red altar shelf
      ctx.fillStyle = "#3a0f0f";
      ctx.fillRect(16, 76, w - 32, 54);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = r(i) > 0.5 ? "#ffd60a" : "#f2c14e";
        ctx.beginPath();
        ctx.arc(28 + i * 15, 96 + (i % 2) * 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#c9a227";
      ctx.fillRect(90, 20, 76, 30);
      light(ctx, w, h);
      return;
    }
    case "barber": {
      // a big mirror, a red chair, the striped pole
      ctx.fillStyle = "#b8d8e8";
      ctx.fillRect(40, 20, 140, 64);
      ctx.fillStyle = "#ffffff55";
      ctx.fillRect(60, 24, 18, 56);
      ctx.fillStyle = "#c1121f";
      ctx.fillRect(84, 92, 50, 34);
      ctx.fillRect(92, 70, 34, 24);
      for (let y = 20; y < 120; y += 12) {
        ctx.fillStyle = (y / 12) % 2 ? "#e63946" : "#ffffff";
        ctx.fillRect(214, y, 12, 6);
        ctx.fillStyle = "#1d6fa3";
        ctx.fillRect(214, y + 6, 12, 6);
      }
      light(ctx, w, h, false);
      floor(ctx, w, h, "#d9d9d4");
      return;
    }
    case "pharmacy": {
      ctx.fillStyle = "#2b9348";
      ctx.fillRect(110, 14, 36, 12);
      ctx.fillRect(122, 2, 12, 36);
      for (let s = 0; s < 3; s++) {
        shelf(ctx, 10, 50 + s * 28, w - 20, "#c9ced3");
        for (let x = 14; x < w - 18; x += 9) {
          ctx.fillStyle = ["#ffffff", "#9fd8c2", "#a0c4ff", "#ffd6a5"][
            Math.floor(r(x + s * 40) * 4)
          ];
          ctx.fillRect(x, 50 + s * 28 - 14, 7, 14);
        }
      }
      light(ctx, w, h, false);
      floor(ctx, w, h, "#d9d9d4");
      return;
    }
    case "candy": {
      // mè xửng in gift boxes stacked high
      for (let i = 0; i < 16; i++) {
        ctx.fillStyle = ["#c1121f", "#ffd60a", "#e9a03b"][i % 3];
        ctx.fillRect(20 + (i % 8) * 28, 40 + Math.floor(i / 8) * 40, 24, 32);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(24 + (i % 8) * 28, 52 + Math.floor(i / 8) * 40, 16, 4);
      }
      break;
    }
    case "tea": {
      // a bright counter with a menu of drinks and cups
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(16, 12, w - 32, 40);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ["#d4a373", "#06d6a0", "#ef476f", "#9b5de5", "#ffd166", "#5c3d2e"][i];
        ctx.fillRect(26 + i * 36, 18, 22, 28);
      }
      ctx.fillStyle = "#2a9d8f";
      ctx.fillRect(16, 92, w - 32, 40);
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = "#f3efe6";
        ctx.fillRect(40 + i * 40, 74, 14, 18);
      }
      light(ctx, w, h, false);
      floor(ctx, w, h, "#b8ab95");
      return;
    }
    case "print": {
      // a big printer, posters on the wall, a paper stack
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ["#ef476f", "#3a86ff", "#ffd166", "#06d6a0"][(i + seed) % 4];
        ctx.fillRect(18 + i * 58, 14, 46, 60);
      }
      ctx.fillStyle = "#3a3d42";
      ctx.fillRect(70, 90, 110, 40);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(84, 84, 82, 8);
      ctx.fillRect(200, 100, 34, 30);
      light(ctx, w, h, false);
      floor(ctx, w, h, "#9aa0a6");
      return;
    }
  }
  light(ctx, w, h);
  floor(ctx, w, h);
}
