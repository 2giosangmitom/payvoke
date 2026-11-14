import { memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { AvalancheLogo } from "./avalanche";
import { DISTRICTS } from "./hue-map";
import { Bandstand, FloatingRestaurant, HueDistricts } from "./hue-schools";
import { Roof, ThoughtBubble } from "./props";
import { drawShop, KIND_BY_SIGN } from "./shops";
import { rand, useCanvasTexture, type V3 } from "./stage";

// A small Huế, all of it in one valley: his street of tube houses (nhà ống),
// the riverside square, the Perfume River with the Trường Tiền bridge, the
// Citadel wall with the flag tower and the Noon Gate, Thiên Mụ pagoda on
// the bank, and green hills all round so no shot ever sees a horizon.
//
// Map (metres, -z is north toward the river):
//   z =  -8         his street, road along x
//   z = -23         the riverside road
//   z = -25 .. -54  the square (PLAZA)
//   z = -55 .. -96  the Perfume River
//   z = -104        the Citadel wall; Noon Gate at z = -127

export const HUE = {
  x0: -50,
  x1: 47,
  street: -8,
  nearFront: -2.75,
  acrossFront: -13.7,
  riverRoad: -23,
  plaza0: -25.4,
  plaza1: -54.5,
  river0: -55,
  river1: -96,
  wall: -104,
  bridgeX: 45,
};
/** The middle of the riverside square: stage, crowd, big screen. */
export const PLAZA: V3 = [0, 0, -40];
/** The Noon Gate's central door. */
export const NGO_MON: V3 = [0, 0, -127];
/** The co-working floor at the top of the yellow building on the square. */
export const OFFICE: V3 = [43, 8, -36];
/** Centre of the valley; the hills ring it. */
const CENTER: V3 = [0, 0, -40];

const FLOOR_H = 3.2;
const VN_FONT = '"Noto Sans", "DejaVu Sans", "Liberation Sans", Arial, sans-serif';

/* ---------------- textures ---------------- */

const WALLS = [
  "#f2c14e",
  "#f7d488",
  "#9fd8c2",
  "#f4a6b8",
  "#8ec5e8",
  "#f7b58a",
  "#c3b1e1",
  "#f3efe6",
  "#b8e0a0",
  "#ffd6a5",
  "#e9c46a",
  "#a0c4ff",
];
const SHUTTERS = ["#2e7d5b", "#1d6fa3", "#7a4a2a", "#2b6f6b", "#5b6b2e", "#b5523b"];
const SIGNS: [string, string][] = [
  ["CÀ PHÊ MUỐI", "Salt coffee · since 1998"],
  ["BÚN BÒ HUẾ", "Open 6am – 10pm"],
  ["CƠM HẾN", "Tasty & cheap"],
  ["BÁNH BÈO", "Since 1985"],
  ["GROCERY", "Drinks · Rice · Snacks"],
  ["NÓN LÁ", "Made in Huế"],
  ["CHÈ HUẾ", "36 sweet soups"],
  ["BÁNH MÌ", "Pâté · Grilled pork"],
  ["BIKE REPAIR", "Tyres · Oil change"],
  ["GOLD SHOP", "Jewellery"],
  ["BARBER", "Men · Women"],
  ["PHARMACY", "Open late"],
  ["MÈ XỬNG", "Huế specialty"],
  ["MILK TEA", "Boba"],
  ["PRINT SHOP", "Photo · Logo"],
  ["PHỞ", "Beef · Chicken"],
];
const SIGN_COLORS: [string, string][] = [
  ["#d62828", "#ffd60a"],
  ["#1d4e89", "#ffffff"],
  ["#2a9d8f", "#fff3b0"],
  ["#ffb703", "#7a1f1f"],
  ["#ffffff", "#d62828"],
  ["#6a4c93", "#ffe08a"],
  ["#2b9348", "#ffffff"],
];

export function drawShopSign(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  [text, sub]: [string, string],
  [bg, fg]: [string, string],
) {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  let size = h * 0.5;
  ctx.font = `800 ${size}px ${VN_FONT}`;
  while (ctx.measureText(text).width > w * 0.86 && size > 10) {
    size -= 2;
    ctx.font = `800 ${size}px ${VN_FONT}`;
  }
  ctx.fillText(text, w / 2, h * 0.58);
  ctx.font = `600 ${h * 0.17}px ${VN_FONT}`;
  ctx.fillText(sub, w / 2, h * 0.85);
}

function drawWindow(ctx: CanvasRenderingContext2D, w: number, h: number, lit: boolean) {
  ctx.fillStyle = "#f3efe6";
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (lit) {
    g.addColorStop(0, "#ffe7a8");
    g.addColorStop(1, "#ffb84d");
  } else {
    g.addColorStop(0, "#3f6c8f");
    g.addColorStop(0.5, "#22384d");
    g.addColorStop(1, "#162433");
  }
  ctx.fillStyle = g;
  const pad = 10;
  const cols = 2;
  const rows = 3;
  const cw = (w - pad * (cols + 1)) / cols;
  const rh = (h - pad * (rows + 1)) / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) ctx.fillRect(pad + c * (cw + pad), pad + r * (rh + pad), cw, rh);
  if (!lit) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.moveTo(w * 0.15, h);
    ctx.lineTo(w * 0.45, 0);
    ctx.lineTo(w * 0.6, 0);
    ctx.lineTo(w * 0.3, h);
    ctx.fill();
  } else {
    // a curtain and a silhouette of a plant
    ctx.fillStyle = "rgba(200,80,60,0.35)";
    ctx.fillRect(pad, pad, cw * 0.5, h - pad * 2);
  }
}

export function useWindowTex(lit: boolean) {
  return useCanvasTexture(128, 192, lit ? "win-lit" : "win-dark", (ctx, w, h) =>
    drawWindow(ctx, w, h, lit),
  );
}

function useRailTex() {
  return useCanvasTexture(256, 64, "rail", (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#2b2d2f";
    ctx.fillRect(0, 0, w, 6);
    ctx.fillRect(0, h - 6, w, 6);
    for (let x = 4; x < w; x += 16) ctx.fillRect(x, 0, 3, h);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#2b2d2f";
    for (let x = 12; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, h / 2, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function useShutterTex() {
  return useCanvasTexture(128, 128, "shutter", (ctx, w, h) => {
    ctx.fillStyle = "#a9adb1";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = "#7d8287";
      ctx.fillRect(0, y, w, 2);
    }
  });
}

/** The shop as seen through its open front: warm light, shelves, goods. */
function useShopTex(seed: number, sign = seed) {
  const kind = KIND_BY_SIGN[sign % KIND_BY_SIGN.length];
  return useCanvasTexture(256, 160, `shop-${kind}-${seed % 3}`, (ctx, w, h) =>
    drawShop(ctx, w, h, kind, seed % 3),
  );
}

function useStripeTex(color: string) {
  return useCanvasTexture(128, 32, `awn-${color}`, (ctx, w, h) => {
    for (let x = 0; x < w; x += 16) {
      ctx.fillStyle = (x / 16) % 2 ? "#ffffff" : color;
      ctx.fillRect(x, 0, 16, h);
    }
  });
}

/** Red with a gold star. */
export function useFlagTex() {
  return useCanvasTexture(150, 100, "vn-flag", (ctx, w, h) => {
    ctx.fillStyle = "#da251d";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffcd00";
    ctx.beginPath();
    const cx = w / 2;
    const cy = h / 2;
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? h * 0.13 : h * 0.33;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.fill();
  });
}

/* ---------------- tube houses ---------------- */

export type TubeSpec = {
  w: number;
  d: number;
  floors: number;
  wall: string;
  shutter: string;
  roof: "flat" | "tile" | "tum";
  sign: number;
  signColor: number;
  awning: string | null;
  balcony: boolean;
  plants: boolean;
  tank: boolean;
  ac: boolean;
  lantern: boolean;
  flag: boolean;
  open: boolean;
  setback: number;
  seed: number;
  /** A parapet along the front of a flat roof (off on the party roofs). */
  parapet: boolean;
};

export function tubeSpec(seed: number, w: number, d: number, flat = false): TubeSpec {
  const r = (k: number) => rand(seed * 13.7 + k);
  return {
    w,
    d,
    // the flat-roofed party houses are all three storeys
    floors: flat ? 3 : 2 + Math.floor(r(1) * 2.6),
    wall: WALLS[Math.floor(r(2) * WALLS.length)],
    shutter: SHUTTERS[Math.floor(r(3) * SHUTTERS.length)],
    roof: flat ? "flat" : (["flat", "tile", "tum", "flat", "tile"] as const)[Math.floor(r(4) * 5)],
    sign: Math.floor(r(5) * SIGNS.length),
    signColor: Math.floor(r(6) * SIGN_COLORS.length),
    awning: r(7) > 0.45 ? ["#e63946", "#1d6fa3", "#2a9d8f", "#f4a261"][Math.floor(r(8) * 4)] : null,
    balcony: r(9) > 0.3,
    plants: r(10) > 0.35,
    tank: r(11) > 0.35,
    ac: r(12) > 0.5,
    lantern: r(13) > 0.55,
    flag: r(14) > 0.75,
    open: r(15) > 0.3,
    setback: flat ? 0 : r(16) * 0.3,
    seed,
    parapet: !flat,
  };
}

const SIGN_H = 0.7;
const Sign = ({ spec, w, text }: { spec: TubeSpec; w: number; text?: [string, string] }) => {
  const cw = Math.round(((w / SIGN_H) * 128) / 32) * 32;
  const words = text ?? SIGNS[spec.sign];
  const map = useCanvasTexture(
    cw,
    128,
    `sign-${words.join("|")}-${spec.signColor}-${cw}`,
    (ctx, x, y) => drawShopSign(ctx, x, y, words, SIGN_COLORS[spec.signColor]),
  );
  return (
    <mesh rotation={[0, Math.PI, 0]}>
      <planeGeometry args={[w, SIGN_H]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.25}
        roughness={0.6}
      />
    </mesh>
  );
};

const Plant = ({ position, flower }: { position: V3; flower?: string }) => (
  <group position={position}>
    <mesh position={[0, 0.13, 0]}>
      <cylinderGeometry args={[0.15, 0.11, 0.26, 10]} />
      <meshStandardMaterial color="#b5523b" />
    </mesh>
    <mesh position={[0, 0.48, 0]} scale={[1, 0.9, 1]}>
      <sphereGeometry args={[0.3, 10, 8]} />
      <meshStandardMaterial color="#3f8f4f" roughness={1} />
    </mesh>
    {flower &&
      [0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[Math.cos(i * 1.7) * 0.22, 0.55 + (i % 2) * 0.12, -0.18]}>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshStandardMaterial color={flower} />
        </mesh>
      ))}
  </group>
);

/**
 * One tube house: narrow and deep, a shop on the ground floor under a sign,
 * balconies with iron rails and pot plants above, a water tank on the roof.
 * Its front faces -z; local origin is the middle of the footprint.
 */
export const TubeHouse = ({
  spec,
  position,
  rotation = 0,
  lit = () => false,
  night = 0,
  detail = true,
  signText,
}: {
  spec: TubeSpec;
  position: V3;
  rotation?: number;
  lit?: (window: number) => boolean;
  night?: number;
  detail?: boolean;
  /** Replaces the generated shop sign. */
  signText?: [string, string];
}) => {
  const { w, d, floors } = spec;
  const H = floors * FLOOR_H;
  const f = -d / 2;
  const winLit = useWindowTex(true);
  const winDark = useWindowTex(false);
  const rail = useRailTex();
  const shutter = useShutterTex();
  const shop = useShopTex(spec.seed, spec.sign);
  const stripes = useStripeTex(spec.awning ?? "#e63946");
  const flag = useFlagTex();
  const cols = w > 4.6 ? 2 : 1;
  const ww = cols === 2 ? 1.05 : 1.5;
  // By day every shop is open; at night only the ones with a light on.
  const shopOpen = night < 0.5 || lit(99);
  let wi = 0;
  return (
    <group
      position={[position[0], position[1], position[2] + spec.setback]}
      rotation={[0, rotation, 0]}
    >
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[w, H, d]} />
        <meshStandardMaterial color={spec.wall} roughness={0.92} />
      </mesh>
      {/* floor bands */}
      {Array.from({ length: floors - 1 }, (_, i) => (
        <mesh key={i} position={[0, (i + 1) * FLOOR_H, f - 0.06]}>
          <boxGeometry args={[w + 0.02, 0.16, 0.14]} />
          <meshStandardMaterial color="#f3efe6" />
        </mesh>
      ))}
      {/* ground floor: open shop or roller shutter, sign, awning */}
      <mesh position={[0, 1.3, f - 0.03]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[w - 0.7, 2.6]} />
        {shopOpen ? (
          <meshStandardMaterial
            map={shop}
            emissiveMap={shop}
            emissive="#ffffff"
            emissiveIntensity={0.35 + night * 0.6}
          />
        ) : (
          <meshStandardMaterial map={shutter} roughness={0.5} metalness={0.4} />
        )}
      </mesh>
      {detail && (
        <group position={[0, 2.72, f - 0.17]}>
          <mesh position={[0, 0, 0.06]}>
            <boxGeometry args={[w - 0.2, SIGN_H + 0.1, 0.08]} />
            <meshStandardMaterial color="#2b2d2f" />
          </mesh>
          <Sign spec={spec} w={w - 0.4} text={signText} />
        </group>
      )}
      {detail && spec.awning && (
        <mesh position={[0, 2.08, f - 0.68]} rotation={[-0.32, 0, 0]}>
          <boxGeometry args={[w - 0.25, 0.04, 1.35]} />
          <meshStandardMaterial map={stripes} roughness={0.8} />
        </mesh>
      )}
      {detail && spec.lantern && (
        <>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (w / 2 - 0.5), 1.55, f - 1.2]} scale={[1, 1.3, 1]}>
              <sphereGeometry args={[0.17, 12, 8]} />
              <meshStandardMaterial
                color="#e63946"
                emissive="#ff5a3c"
                emissiveIntensity={0.2 + night * 1.6}
              />
            </mesh>
          ))}
        </>
      )}
      {/* upper floors */}
      {Array.from({ length: floors - 1 }, (_, fi) => {
        const y0 = (fi + 1) * FLOOR_H;
        return (
          <group key={fi}>
            {Array.from({ length: cols }, (_, c) => {
              const x = cols === 2 ? (c ? 1 : -1) * w * 0.24 : 0;
              const on = lit(wi++);
              return (
                <group key={c} position={[x, y0 + 1.3, f - 0.02]}>
                  <mesh rotation={[0, Math.PI, 0]}>
                    <planeGeometry args={[ww, 1.95]} />
                    <meshStandardMaterial
                      map={on ? winLit : winDark}
                      emissiveMap={on ? winLit : undefined}
                      emissive={on ? "#ffffff" : "#000000"}
                      emissiveIntensity={on ? 0.9 : 0}
                      roughness={0.3}
                    />
                  </mesh>
                  {detail &&
                    [-1, 1].map((s) => (
                      <mesh key={s} position={[s * (ww * 0.75 + 0.03), 0, -0.03]}>
                        <boxGeometry args={[ww / 2, 1.95, 0.05]} />
                        <meshStandardMaterial color={spec.shutter} />
                      </mesh>
                    ))}
                </group>
              );
            })}
            {detail && spec.balcony && (
              <group position={[0, y0, f - 0.47]}>
                <mesh>
                  <boxGeometry args={[w - 0.2, 0.2, 0.9]} />
                  <meshStandardMaterial color="#e9e4d8" />
                </mesh>
                <mesh position={[0, 0.5, -0.44]}>
                  <planeGeometry args={[w - 0.2, 0.9]} />
                  <meshStandardMaterial map={rail} alphaTest={0.5} side={THREE.DoubleSide} />
                </mesh>
                {spec.plants && (
                  <>
                    <Plant
                      position={[-(w / 2 - 0.55), 0.1, -0.1]}
                      flower={(spec.seed + fi) % 2 ? "#e84f8a" : undefined}
                    />
                    <Plant position={[w / 2 - 0.55, 0.1, -0.1]} flower="#f4a261" />
                  </>
                )}
              </group>
            )}
            {detail && spec.ac && fi === 0 && (
              <mesh position={[w / 2 - 0.5, y0 + 2.75, f - 0.16]}>
                <boxGeometry args={[0.7, 0.42, 0.28]} />
                <meshStandardMaterial color="#e8e8e8" />
              </mesh>
            )}
          </group>
        );
      })}
      {/* the back: small windows and a kitchen door, seen from the square */}
      {Array.from({ length: floors }, (_, fi) => (
        <group key={`back${fi}`} position={[0, fi * FLOOR_H + 1.5, -f + 0.02]}>
          {(fi === 0 ? [-w * 0.25] : [-w * 0.25, w * 0.25]).map((x, k) => {
            const on = lit(50 + fi * 2 + k);
            return (
              <mesh key={k} position={[x, fi === 0 ? 0.1 : 0.1, 0]}>
                <planeGeometry args={[fi === 0 ? 0.9 : 0.9, fi === 0 ? 1.0 : 1.3]} />
                <meshStandardMaterial
                  map={on ? winLit : winDark}
                  emissiveMap={on ? winLit : undefined}
                  emissive={on ? "#ffffff" : "#000000"}
                  emissiveIntensity={on ? 0.8 : 0}
                />
              </mesh>
            );
          })}
          {fi === 0 && (
            <mesh position={[w * 0.22, -0.4, 0]}>
              <planeGeometry args={[0.9, 2.1]} />
              <meshStandardMaterial color={spec.shutter} />
            </mesh>
          )}
          {fi > 0 && spec.ac && (
            <mesh position={[0, 1.2, 0.15]}>
              <boxGeometry args={[0.7, 0.42, 0.28]} />
              <meshStandardMaterial color="#e8e8e8" />
            </mesh>
          )}
        </group>
      ))}
      {/* roof */}
      {spec.roof !== "tile" && (
        <group position={[0, H, 0]}>
          {[
            [0, f + 0.07, w, 0.14],
            [0, -f - 0.07, w, 0.14],
          ]
            .filter((_, i) => i > 0 || spec.parapet)
            .map(([x, z, sw, sd], i) => (
              <mesh key={i} position={[x, 0.4, z]}>
                <boxGeometry args={[sw, 0.8, sd]} />
                <meshStandardMaterial color={spec.wall} roughness={0.92} />
              </mesh>
            ))}
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * (w / 2 - 0.07), 0.4, 0]}>
              <boxGeometry args={[0.14, 0.8, d - 0.3]} />
              <meshStandardMaterial color={spec.wall} roughness={0.92} />
            </mesh>
          ))}
          {spec.roof === "tum" && (
            <group position={[0, 0, d * 0.2]}>
              <mesh position={[0, 1.2, 0]}>
                <boxGeometry args={[Math.min(2.6, w - 0.8), 2.4, 2.8]} />
                <meshStandardMaterial color={spec.wall} roughness={0.92} />
              </mesh>
              <Roof position={[0, 2.4, 0]} w={Math.min(3, w - 0.4)} d={3.4} h={1} color="#b5523b" />
            </group>
          )}
          {spec.tank && (
            <group position={[-w * 0.18, 0, d * 0.3 - (spec.roof === "tum" ? 2.6 : 0)]}>
              <mesh position={[0, 0.35, 0]}>
                <boxGeometry args={[0.9, 0.7, 0.9]} />
                <meshStandardMaterial color="#6b7075" />
              </mesh>
              <mesh position={[0, 1.15, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.45, 0.45, 1.5, 16]} />
                <meshStandardMaterial color="#d8dde2" metalness={0.85} roughness={0.25} />
              </mesh>
            </group>
          )}
          {detail && spec.flag && (
            <group position={[w / 2 - 0.4, 0, f + 0.4]}>
              <mesh position={[0, 1.2, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 2.4, 6]} />
                <meshStandardMaterial color="#cccccc" />
              </mesh>
              <mesh position={[-0.5, 2.05, 0]} rotation={[0, Math.PI, 0]}>
                <planeGeometry args={[0.9, 0.6]} />
                <meshStandardMaterial map={flag} side={THREE.DoubleSide} />
              </mesh>
            </group>
          )}
        </group>
      )}
      {spec.roof === "tile" && (
        <Roof
          position={[0, H, 0]}
          w={w + 0.1}
          d={d + 0.5}
          h={1.8}
          color={["#b5523b", "#c45a3c", "#8a4b3a"][spec.seed % 3]}
        />
      )}
    </group>
  );
};

/* ---------------- the hero's house ---------------- */

/**
 * His house: a yellow two-storey Huế house with green shutters and a
 * terracotta roof. The upstairs room (Room + HouseShell) sits on top at
 * y = UP. The ground floor stops a few centimetres short of UP so its top
 * never shares a plane with the room's floor: that was the flicker.
 */
const HOME_WALL = "#f6ead0";
const HOME_TRIM = "#ffffff";
const HOME_SHUTTER = "#2a9d8f";

/** White balusters for balconies and terraces (alpha-tested). */
function useBalusterTex() {
  return useCanvasTexture(256, 64, "baluster", (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, 9);
    ctx.fillRect(0, h - 7, w, 7);
    for (let x = 6; x < w; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 9);
      ctx.quadraticCurveTo(x - 5, h / 2, x, h - 7);
      ctx.lineTo(x + 8, h - 7);
      ctx.quadraticCurveTo(x + 13, h / 2, x + 8, 9);
      ctx.fill();
    }
  });
}

function useFoldingGateTex() {
  return useCanvasTexture(256, 224, "folding-gate", (ctx, w, h) => {
    ctx.fillStyle = "#23282c";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a8f86";
    for (let x = 0; x < w; x += 14) ctx.fillRect(x, 0, 5, h);
    for (let y = 18; y < h; y += 56) {
      ctx.fillRect(0, y, w, 4);
      for (let x = 0; x < w; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        ctx.lineTo(x + 14, y + 24);
        ctx.lineTo(x + 28, y + 4);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#2a8f86";
        ctx.stroke();
      }
    }
    ctx.fillRect(0, 0, w, 10);
  });
}

function useHouseNumber() {
  return useCanvasTexture(128, 96, "house-36", (ctx, w, h) => {
    ctx.fillStyle = "#1d4e89";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `800 52px ${VN_FONT}`;
    ctx.fillText("36", w / 2, 66);
  });
}

/**
 * His house, ground floor: cream walls over terracotta tiles, a folding
 * iron garage gate, a shuttered window, a house number and his scooter.
 * It stops a few centimetres short of UP so it never shares a plane with
 * the room's floor (that was the old flicker).
 */
export const HueHeroHome = ({ lit = 1, night = 0 }: { lit?: number; night?: number }) => {
  const winLit = useWindowTex(true);
  const winDark = useWindowTex(false);
  const gate = useFoldingGateTex();
  const number = useHouseNumber();
  const UP = FLOOR_H;
  return (
    <group>
      <mesh position={[0, (UP - 0.04) / 2, 0]}>
        <boxGeometry args={[6.4, UP - 0.04, 5.4]} />
        <meshStandardMaterial color={HOME_WALL} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[6.44, 0.6, 5.44]} />
        <meshStandardMaterial color="#b5523b" roughness={0.8} />
      </mesh>
      {/* the garage with its folding iron gate */}
      <mesh position={[1.2, 1.35, -2.73]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[3.2, 2.7]} />
        <meshStandardMaterial map={gate} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[1.2, 2.78, -2.76]}>
        <boxGeometry args={[3.5, 0.16, 0.1]} />
        <meshStandardMaterial color={HOME_TRIM} />
      </mesh>
      <group position={[-1.9, 1.55, -2.73]}>
        <mesh rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[1.2, 1.4]} />
          <meshStandardMaterial
            map={lit > 0.5 ? winLit : winDark}
            emissiveMap={lit > 0.5 ? winLit : undefined}
            emissive={lit > 0.5 ? "#ffffff" : "#000"}
            emissiveIntensity={lit > 0.5 ? 0.6 : 0}
          />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.92, 0, -0.03]}>
            <boxGeometry args={[0.6, 1.4, 0.05]} />
            <meshStandardMaterial color={HOME_SHUTTER} />
          </mesh>
        ))}
      </group>
      <mesh position={[-0.55, 2.35, -2.74]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[0.42, 0.32]} />
        <meshStandardMaterial map={number} />
      </mesh>
      <mesh position={[-0.55, 2.75, -2.82]}>
        <sphereGeometry args={[0.1, 10, 8]} />
        <meshStandardMaterial
          color="#ffe2a6"
          emissive="#ffc35a"
          emissiveIntensity={0.4 + night * 1.6}
        />
      </mesh>
      <Plant position={[-3.0, 0.02, -3.3]} flower="#e84f8a" />
      <Plant position={[3.0, 0.02, -3.3]} />
    </group>
  );
};

/**
 * His house from the first floor up, wrapped around the Room: the front
 * wall with his window and teal shutters, a balcony with white balusters,
 * and a set-back top floor with a terrace, laundry, a tile canopy, a water
 * tank and bougainvillea spilling down. Local y = 0 is his floor (UP).
 */
export const HeroShell = () => {
  const balusters = useBalusterTex();
  const winDark = useWindowTex(false);
  const W = 1.6;
  const H = 1.1;
  const WY = 1.75;
  const wall = <meshStandardMaterial color={HOME_WALL} roughness={0.9} />;
  return (
    <group>
      {/* the front wall, with the window hole */}
      <group position={[0, 0, -2.62]}>
        <mesh position={[0, (WY - H / 2) / 2, 0]}>
          <boxGeometry args={[6.4, WY - H / 2, 0.12]} />
          {wall}
        </mesh>
        <mesh position={[0, (3.2 + WY + H / 2) / 2, 0]}>
          <boxGeometry args={[6.4, 3.2 - WY - H / 2, 0.12]} />
          {wall}
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 + (3.2 - W / 2) / 2), WY, 0]}>
            <boxGeometry args={[3.2 - W / 2, H, 0.12]} />
            {wall}
          </mesh>
        ))}
        {/* white frame and teal shutters */}
        {[-1, 1].map((s) => (
          <mesh key={`f${s}`} position={[s * (W / 2 + 0.07), WY, -0.1]}>
            <boxGeometry args={[0.14, H + 0.28, 0.08]} />
            <meshStandardMaterial color={HOME_TRIM} />
          </mesh>
        ))}
        <mesh position={[0, WY + H / 2 + 0.07, -0.1]}>
          <boxGeometry args={[W + 0.28, 0.14, 0.08]} />
          <meshStandardMaterial color={HOME_TRIM} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={`s${s}`} position={[s * (W / 2 + 0.5), WY, -0.12]}>
            <boxGeometry args={[0.62, H + 0.2, 0.05]} />
            <meshStandardMaterial color={HOME_SHUTTER} />
          </mesh>
        ))}
        <mesh position={[0, 3.1, -0.12]}>
          <boxGeometry args={[6.5, 0.2, 0.2]} />
          <meshStandardMaterial color={HOME_TRIM} />
        </mesh>
      </group>
      {/* sides, back, the slab above his ceiling */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.14, 1.6, 0]}>
          <boxGeometry args={[0.12, 3.2, 5.36]} />
          {wall}
        </mesh>
      ))}
      <mesh position={[0, 1.6, 2.64]}>
        <boxGeometry args={[6.4, 3.2, 0.12]} />
        {wall}
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[6.4, 0.1, 5.4]} />
        {wall}
      </mesh>
      {/* the balcony under his window */}
      <mesh position={[0, -0.08, -3.18]}>
        <boxGeometry args={[4.6, 0.16, 1.05]} />
        <meshStandardMaterial color={HOME_TRIM} />
      </mesh>
      <mesh position={[0, 0.48, -3.69]}>
        <planeGeometry args={[4.6, 0.95]} />
        <meshStandardMaterial map={balusters} alphaTest={0.5} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`b${s}`} position={[s * 2.29, 0.48, -3.19]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.0, 0.95]} />
          <meshStandardMaterial map={balusters} alphaTest={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <Plant position={[-1.8, 0, -3.35]} flower="#e84f8a" />
      <Plant position={[1.8, 0, -3.35]} flower="#f4a261" />
      {/* the top floor, set back behind a terrace */}
      <mesh position={[0, 3.15 + 1.45, 0.85]}>
        <boxGeometry args={[6.4, 2.9, 3.5]} />
        {wall}
      </mesh>
      <mesh position={[-1.0, 3.15 + 1.15, -0.92]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.8, 2.2]} />
        <meshStandardMaterial map={winDark} />
      </mesh>
      <mesh position={[1.7, 3.15 + 1.5, -0.92]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.0, 1.2]} />
        <meshStandardMaterial map={winDark} />
      </mesh>
      <mesh position={[0, 3.15 + 2.7, -1.4]} rotation={[-0.28, 0, 0]}>
        <boxGeometry args={[6.6, 0.08, 1.1]} />
        <meshStandardMaterial color="#c45a3c" roughness={0.85} />
      </mesh>
      <mesh position={[0, 3.15 + 0.5, -2.66]}>
        <planeGeometry args={[6.4, 0.9]} />
        <meshStandardMaterial map={balusters} alphaTest={0.5} side={THREE.DoubleSide} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={`t${s}`} position={[s * 3.17, 3.15 + 0.5, -1.78]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.76, 0.9]} />
          <meshStandardMaterial map={balusters} alphaTest={0.5} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* laundry on the terrace */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={x} position={[x, 3.15 + 0.9, -1.8]}>
          <cylinderGeometry args={[0.03, 0.03, 1.8, 6]} />
          <meshStandardMaterial color="#9aa0a6" />
        </mesh>
      ))}
      <mesh position={[0, 3.15 + 1.78, -1.8]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 5.2, 4]} />
        <meshStandardMaterial color="#555" />
      </mesh>
      {["#e63946", "#ffd166", "#3a86ff", "#ffffff", "#06d6a0"].map((c, i) => (
        <mesh
          key={c}
          position={[-1.9 + i * 0.95, 3.15 + 1.45, -1.8]}
          rotation={[0, 0.1 * (i - 2), 0]}
        >
          <planeGeometry args={[0.5, 0.62]} />
          <meshStandardMaterial color={c} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* the roof: flat, a water tank and a solar heater */}
      <mesh position={[0, 6.12, 0.85]}>
        <boxGeometry args={[6.6, 0.15, 3.7]} />
        <meshStandardMaterial color={HOME_TRIM} />
      </mesh>
      <mesh position={[-1.6, 6.45, 1.5]}>
        <boxGeometry args={[0.9, 0.5, 0.9]} />
        <meshStandardMaterial color="#6b7075" />
      </mesh>
      <mesh position={[-1.6, 7.1, 1.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.45, 0.45, 1.5, 16]} />
        <meshStandardMaterial color="#d8dde2" metalness={0.85} roughness={0.25} />
      </mesh>
      <mesh position={[1.4, 6.6, 1.4]} rotation={[-0.6, 0, 0]}>
        <boxGeometry args={[1.6, 0.06, 1.1]} />
        <meshStandardMaterial color="#1d3557" metalness={0.6} roughness={0.2} />
      </mesh>
      {/* bougainvillea spilling from the terrace down past the balcony */}
      {Array.from({ length: 12 }, (_, i) => (
        <mesh key={`g${i}`} position={[2.5 + (i % 3) * 0.25, 3.6 - i * 0.26, -2.8 - (i % 2) * 0.1]}>
          <sphereGeometry args={[0.24 - (i % 4) * 0.03, 10, 8]} />
          <meshStandardMaterial color={i % 3 === 1 ? "#3f8f4f" : i % 2 ? "#d63b7a" : "#e84f8a"} />
        </mesh>
      ))}
    </group>
  );
};

/* ---------------- street furniture ---------------- */

/** A classic riverside lamp post with two globes. */
export const LampPost = ({
  position,
  on = 0,
  light = false,
}: {
  position: V3;
  on?: number;
  light?: boolean;
}) => (
  <group position={position}>
    <mesh position={[0, 1.8, 0]}>
      <cylinderGeometry args={[0.06, 0.1, 3.6, 8]} />
      <meshStandardMaterial color="#1f3b33" metalness={0.5} roughness={0.4} />
    </mesh>
    <mesh position={[0, 3.6, 0]}>
      <boxGeometry args={[1, 0.06, 0.06]} />
      <meshStandardMaterial color="#1f3b33" />
    </mesh>
    {[-0.5, 0.5].map((x) => (
      <mesh key={x} position={[x, 3.85, 0]}>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshBasicMaterial color={on > 0.5 ? "#fff1c4" : "#d9d4c0"} toneMapped={false} />
      </mesh>
    ))}
    {light && on > 0.5 && (
      <pointLight
        position={[0, 3.4, 0]}
        color="#ffd59a"
        intensity={16 * on}
        distance={14}
        decay={1}
      />
    )}
  </group>
);

/** Phượng: the flame tree, a wide flat canopy of red-orange. */
export const FlameTree = ({
  position,
  s = 1,
  seed = 0,
}: {
  position: V3;
  s?: number;
  seed?: number;
}) => (
  <group position={position} scale={s} rotation={[0, seed, 0]}>
    <mesh position={[0, 1.3, 0]}>
      <cylinderGeometry args={[0.14, 0.24, 2.6, 8]} />
      <meshStandardMaterial color="#5a3d2b" />
    </mesh>
    {[
      [0, 3.0, 0, 1.8],
      [1.2, 2.8, 0.4, 1.3],
      [-1.1, 2.85, -0.3, 1.4],
      [0.2, 3.2, -1.0, 1.2],
    ].map(([x, y, z, r], i) => (
      <mesh key={i} position={[x, y, z]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[r, 12, 8]} />
        <meshStandardMaterial color={i % 2 ? "#e8492b" : "#f2622e"} roughness={1} />
      </mesh>
    ))}
    <mesh position={[0, 2.7, 0]} scale={[1, 0.4, 1]}>
      <sphereGeometry args={[1.9, 12, 8]} />
      <meshStandardMaterial color="#4f8f3f" roughness={1} />
    </mesh>
  </group>
);

/** A concrete power pole; the wires are strung by `Wires`. */
const Pole = ({ position }: { position: V3 }) => (
  <group position={position}>
    <mesh position={[0, 3.6, 0]}>
      <boxGeometry args={[0.22, 7.2, 0.22]} />
      <meshStandardMaterial color="#b9b5aa" />
    </mesh>
    <mesh position={[0, 6.6, 0]}>
      <boxGeometry args={[1.4, 0.1, 0.1]} />
      <meshStandardMaterial color="#8a877f" />
    </mesh>
    <mesh position={[0.25, 5.2, -0.2]}>
      <cylinderGeometry args={[0.22, 0.22, 0.7, 10]} />
      <meshStandardMaterial color="#6b7075" />
    </mesh>
  </group>
);

/** Sagging wires between poles: the tangled skyline of every Vietnamese street. */
const Wires = ({ xs, z }: { xs: number[]; z: number }) => {
  const geometries = useMemo(() => {
    const out: THREE.TubeGeometry[] = [];
    for (let i = 0; i < xs.length - 1; i++)
      for (let k = 0; k < 4; k++) {
        const y = 6.6 - (k % 2) * 0.05;
        const dz = (k - 1.5) * 0.35;
        const pts = Array.from({ length: 9 }, (_, j) => {
          const u = j / 8;
          return new THREE.Vector3(
            xs[i] + (xs[i + 1] - xs[i]) * u,
            y - Math.sin(Math.PI * u) * (0.5 + k * 0.12),
            z + dz,
          );
        });
        out.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.018, 4));
      }
    return out;
  }, [xs, z]);
  return (
    <>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color="#1a1a1a" />
        </mesh>
      ))}
    </>
  );
};

/* ---------------- lots ---------------- */

export type Lot = { x: number; w: number; spec: TubeSpec };

function fill(
  from: number,
  to: number,
  seed: number,
  d: number,
  flatNear?: (x: number) => boolean,
) {
  const out: Lot[] = [];
  const dir = Math.sign(to - from);
  let x = from;
  let i = 0;
  while (dir > 0 ? x < to - 3 : x > to + 3) {
    const w = 3.9 + rand(seed + i * 7.3) * 1.7;
    const cx = x + (dir * w) / 2;
    out.push({ x: cx, w: w - 0.04, spec: tubeSpec(seed + i, w - 0.04, d, flatNear?.(cx)) });
    x += dir * w;
    i++;
  }
  return out;
}

/** The houses facing his street from the far side. Centre ones have flat
 * roofs: the town parties on them in the finale. */
export const ACROSS: Lot[] = fill(HUE.x0, HUE.x1, 400, 6.8, (x) => Math.abs(x) < 16);
const NEAR: Lot[] = [...fill(3.25, HUE.x1, 100, 8), ...fill(-3.25, HUE.x0, 200, 8)];
const BACK: Lot[] = fill(HUE.x0, HUE.x1, 700, 6.4);

/** Roof height of a flat-roofed lot on the far side (for the rooftop party). */
export const roofTop = (lot: Lot) => lot.spec.floors * FLOOR_H;

/* ---------------- ground, river, bank ---------------- */

function usePlazaTex() {
  return useCanvasTexture(256, 256, "plaza-tiles", (ctx, w, h) => {
    ctx.fillStyle = "#cbbfa6";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        ctx.fillStyle = (i + j) % 2 ? "#c2b59a" : "#d4c9b2";
        ctx.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
      }
    ctx.strokeStyle = "#a8402f";
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, w, h);
  });
}

export const Flat = ({
  position,
  size,
  color,
  map,
  repeat,
}: {
  position: V3;
  size: [number, number];
  color?: string;
  map?: THREE.Texture;
  repeat?: [number, number];
}) => {
  const t = useMemo(() => {
    if (!map || !repeat) return map;
    const c = map.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  }, [map, repeat]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color ?? "#ffffff"} map={t} roughness={1} />
    </mesh>
  );
};

const Ground = ({ grass, night }: { grass: string; night: number }) => {
  const plaza = usePlazaTex();
  const asphalt = night > 0.5 ? "#23262b" : "#3a3d42";
  const walk = "#b9ad97";
  return (
    <group>
      {/* Layers sit at least 2 cm apart and never overlap at the same
          height: no z-fighting even in the high wide shots. */}
      {/* south and north banks, the river runs between them */}
      <Flat position={[0, -0.06, 130]} size={[700, 370]} color={grass} />
      <Flat position={[0, -0.06, -250]} size={[700, 308]} color={grass} />
      {/* his street */}
      <Flat position={[-3, 0, HUE.street]} size={[110, 5]} color={asphalt} />
      {Array.from({ length: 26 }, (_, i) => (
        <Flat
          key={i}
          position={[HUE.x0 + 2 + i * 4, 0.025, HUE.street]}
          size={[1.6, 0.12]}
          color="#e8e2c8"
        />
      ))}
      <Flat position={[-3, 0.04, -4.1]} size={[110, 2.8]} color={walk} />
      <Flat position={[-3, 0.04, -12.1]} size={[110, 3.2]} color={walk} />
      {/* cross streets at both ends */}
      {[HUE.x0 - 5].map((x) => (
        <Flat key={x} position={[x, 0.02, -2]} size={[6, 50]} color={asphalt} />
      ))}
      {/* riverside road, the square, lawns either side of it */}
      <Flat position={[-3, 0, HUE.riverRoad]} size={[110, 4.4]} color={asphalt} />
      <Flat
        position={[0, 0.05, (HUE.plaza0 + HUE.plaza1) / 2]}
        size={[64, HUE.plaza0 - HUE.plaza1]}
        map={plaza}
        repeat={[16, 7.3]}
      />
      <Flat position={[-45, 0.03, -40]} size={[26, 29]} color="#7cb35a" />
      <Flat position={[42, 0.03, -40]} size={[20, 29]} color="#7cb35a" />
      {/* the river walls */}
      <mesh position={[0, -0.35, HUE.river0 + 0.3]}>
        <boxGeometry args={[700, 0.9, 0.6]} />
        <meshStandardMaterial color="#9a917f" />
      </mesh>
      <mesh position={[0, -0.35, HUE.river1 - 0.3]}>
        <boxGeometry args={[700, 0.9, 0.6]} />
        <meshStandardMaterial color="#9a917f" />
      </mesh>
    </group>
  );
};

/** A tiling normal map of small criss-crossing ripples. */
function useWaterNormals() {
  const base = useCanvasTexture(256, 256, "water-normals", (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    const waves: [number, number, number, number][] = [
      [3, 1, 1.0, 0.3],
      [-2, 4, 0.7, 1.7],
      [7, -3, 0.35, 2.9],
      [1, 9, 0.25, 0.8],
      [12, 5, 0.15, 4.1],
    ];
    const height = (x: number, y: number) =>
      waves.reduce(
        (sum, [kx, ky, a, ph]) =>
          sum + a * Math.sin(2 * Math.PI * ((kx * x) / w + (ky * y) / h) + ph),
        0,
      );
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const dx = height(x + 1, y) - height(x - 1, y);
        const dy = height(x, y + 1) - height(x, y - 1);
        const nx = -dx * 3;
        const ny = -dy * 3;
        const l = Math.hypot(nx, ny, 1);
        const i = (y * w + x) * 4;
        img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  });
  return useMemo(() => {
    const t = base.clone();
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(150, 18);
    t.needsUpdate = true;
    return t;
  }, [base]);
}

/** The Perfume River: jade green, rippling, catching the sky and lights. */
const River = ({ t, night }: { t: number; night: number }) => {
  const normals = useWaterNormals();
  normals.offset.set(t * 0.015, t * 0.006);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.55, (HUE.river0 + HUE.river1) / 2]}>
      <planeGeometry args={[700, HUE.river0 - HUE.river1 + 2]} />
      <meshStandardMaterial
        color={new THREE.Color("#2e6e62").lerp(new THREE.Color("#0e2a30"), night).getStyle()}
        normalMap={normals}
        normalScale={[0.16, 0.16]}
        metalness={0.2}
        roughness={0.22}
      />
    </mesh>
  );
};

/* ---------------- landmarks ---------------- */

/** Trường Tiền bridge: six silver arch spans, lit up in colour at night. */
export const Bridge = ({ t, night }: { t: number; night: number }) => {
  const { geometries, members } = useMemo(() => {
    const z0 = HUE.river0 + 1;
    const z1 = HUE.river1 - 1;
    const spans = 6;
    const L = (z0 - z1) / spans;
    const g: THREE.TubeGeometry[] = [];
    const m: { p: V3; h: number; tilt: number }[] = [];
    for (const side of [-1, 1])
      for (let s = 0; s < spans; s++) {
        const za = z0 - s * L;
        const pts = Array.from({ length: 13 }, (_, j) => {
          const u = j / 12;
          return new THREE.Vector3(side * 3.7, 0.9 + Math.sin(Math.PI * u) * 2.6, za - u * L);
        });
        g.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.14, 6));
        for (let j = 1; j < 8; j++) {
          const u = j / 8;
          const h = Math.sin(Math.PI * u) * 2.6;
          m.push({ p: [side * 3.7, 0.9 + h / 2, za - u * L], h, tilt: j % 2 ? 0.35 : -0.35 });
        }
      }
    return { geometries: g, members: m };
  }, []);
  const hue = (t * 0.05) % 1;
  const glow = new THREE.Color().setHSL(hue, 0.9, 0.6);
  return (
    <group position={[HUE.bridgeX, 0, 0]}>
      <mesh position={[0, 0.7, (HUE.river0 + HUE.river1) / 2]}>
        <boxGeometry args={[8, 0.4, HUE.river0 - HUE.river1 + 2]} />
        <meshStandardMaterial color="#8a8d92" />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[0, -0.1, HUE.river0 + 1 - (i * (HUE.river0 - HUE.river1 - 2)) / 6]}
        >
          <boxGeometry args={[8.6, 1.4, 1.2]} />
          <meshStandardMaterial color="#9a917f" />
        </mesh>
      ))}
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial
            color="#d7dbe0"
            metalness={0.7}
            roughness={0.3}
            emissive={glow}
            emissiveIntensity={night * 1.4}
          />
        </mesh>
      ))}
      {members.map((m, i) => (
        <mesh key={i} position={m.p} rotation={[m.tilt, 0, 0]}>
          <boxGeometry args={[0.08, m.h / Math.cos(m.tilt), 0.08]} />
          <meshStandardMaterial
            color="#c9ccd2"
            metalness={0.6}
            roughness={0.35}
            emissive={glow}
            emissiveIntensity={night * 0.8}
          />
        </mesh>
      ))}
    </group>
  );
};

/**
 * A hip roof of the imperial kind: four slopes meeting a ridge, eaves that
 * overhang and curve up at the corners, a ridge beam with upturned ends.
 * Built as a flat-shaded mesh so the slopes read crisply. `w` x `d` is the
 * building's footprint; the roof overhangs it by 0.9 m all round.
 */
function hipRoof(w: number, d: number, h: number, lift: number) {
  const o = 0.9;
  const W = w / 2 + o;
  const D = d / 2 + o;
  const r = Math.max(0.2, (w - d) / 2);
  const C = (x: number, z: number): [number, number, number] => [x, lift, z];
  const M = (x: number, z: number): [number, number, number] => [x, 0, z];
  const R0: [number, number, number] = [-r, h, 0];
  const R1: [number, number, number] = [r, h, 0];
  const FL = C(-W, D),
    FR = C(W, D),
    BL = C(-W, -D),
    BR = C(W, -D);
  const Fm = M(0, D),
    Bm = M(0, -D),
    Lm = M(-W, 0),
    Rm = M(W, 0);
  // the eave sags slightly between corners: quarter points
  const q = (a: [number, number, number], b: [number, number, number]) =>
    [(a[0] + b[0]) / 2, ((a[1] + b[1]) / 2) * 0.55, (a[2] + b[2]) / 2] as [number, number, number];
  const FLm = q(FL, Fm),
    FRm = q(Fm, FR),
    BLm = q(BL, Bm),
    BRm = q(Bm, BR);
  const tris: [number, number, number][][] = [
    // front slope (+z)
    [FL, FLm, R0],
    [FLm, Fm, R0],
    [Fm, R1, R0],
    [Fm, FRm, R1],
    [FRm, FR, R1],
    // back slope (-z)
    [BR, BRm, R1],
    [BRm, Bm, R1],
    [Bm, R0, R1],
    [Bm, BLm, R0],
    [BLm, BL, R0],
    // hips at the ends
    [BL, Lm, R0],
    [Lm, FL, R0],
    [FR, Rm, R1],
    [Rm, BR, R1],
  ];
  const pos = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => t.forEach((v, j) => pos.set(v, i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return { g, W, D, r };
}

export const PalaceRoof = ({
  position,
  w,
  d,
  h,
  color = "#e8b32e",
}: {
  position: V3;
  w: number;
  d: number;
  h: number;
  color?: string;
}) => {
  const lift = Math.min(0.9, h * 0.28);
  const roof = useMemo(() => hipRoof(w, d, h, lift), [w, d, h, lift]);
  const { W, D, r } = roof;
  return (
    <group position={position}>
      <mesh geometry={roof.g}>
        <meshStandardMaterial color={color} roughness={0.45} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* the underside of the eaves, dark timber */}
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[W * 2 - 0.2, D * 2 - 0.2]} />
        <meshStandardMaterial color="#5a2a1a" side={THREE.DoubleSide} />
      </mesh>
      {/* ridge beam with curled ends */}
      <mesh position={[0, h + 0.12, 0]}>
        <boxGeometry args={[r * 2 + 0.4, 0.28, 0.32]} />
        <meshStandardMaterial color="#c9952a" roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (r + 0.25), h + 0.45, 0]} rotation={[0, 0, s * -0.5]}>
          <coneGeometry args={[0.16, 0.8, 6]} />
          <meshStandardMaterial color="#c9952a" />
        </mesh>
      ))}
      {/* the upturned corner tips */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}${sz}`}
            position={[sx * W, lift + 0.18, sz * D]}
            rotation={[sz * 0.5, 0, -sx * 0.5]}
          >
            <coneGeometry args={[0.12, 0.6, 6]} />
            <meshStandardMaterial color="#c9952a" />
          </mesh>
        )),
      )}
      {r > 1.5 && (
        <mesh position={[0, h + 0.55, 0]}>
          <sphereGeometry args={[0.32, 12, 10]} />
          <meshStandardMaterial color="#f7d56b" metalness={0.6} roughness={0.3} />
        </mesh>
      )}
    </group>
  );
};

function useStone(rx: number, ry: number) {
  const base = useCanvasTexture(256, 256, "stone", (ctx, w, h) => {
    ctx.fillStyle = "#8a7a68";
    ctx.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      const off = r % 2 ? 32 : 0;
      for (let c = -1; c < 5; c++) {
        const shade = 0.85 + rand(r * 7 + c) * 0.3;
        ctx.fillStyle = `rgb(${138 * shade},${122 * shade},${104 * shade})`;
        ctx.fillRect(c * 64 + off + 2, r * rh + 2, 60, rh - 4);
      }
    }
    // moss and rain streaks
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(70,90,55,${0.12 + rand(i) * 0.2})`;
      ctx.fillRect(rand(i + 3) * w, 0, 3 + rand(i + 5) * 8, rand(i + 9) * h * 0.6);
    }
  });
  return useMemo(() => {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    return t;
  }, [base, rx, ry]);
}

/** A big red lantern with a gold tassel. */
const RedLantern = ({ position, night }: { position: V3; night: number }) => (
  <group position={position}>
    <mesh scale={[1, 1.25, 1]}>
      <sphereGeometry args={[0.6, 16, 12]} />
      <meshStandardMaterial
        color="#d62828"
        emissive="#ff4a2a"
        emissiveIntensity={0.3 + night * 1.4}
      />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} position={[0, s * 0.72, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 0.12, 12]} />
        <meshStandardMaterial color="#e8b32e" />
      </mesh>
    ))}
    <mesh position={[0, -1.05, 0]}>
      <cylinderGeometry args={[0.04, 0.12, 0.6, 8]} />
      <meshStandardMaterial color="#e8b32e" />
    </mesh>
  </group>
);

/** Ngọ Môn, the Noon Gate: a stone base with three doors and the
 * Five-Phoenix pavilion on top. */
export const NoonGate = ({ night }: { night: number }) => {
  const [x, , z] = NGO_MON;
  const stone = "#ffffff";
  const front = useStone(8, 1.5);
  const wing = useStone(2, 1.5);
  const plaque = useCanvasTexture(512, 160, "ngo-mon", (ctx, w, h) => {
    ctx.fillStyle = "#1d3b5c";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e8b32e";
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.fillStyle = "#f7d56b";
    ctx.textAlign = "center";
    ctx.font = `800 80px ${VN_FONT}`;
    ctx.fillText("NGỌ MÔN", w / 2, h * 0.68);
  });
  const door = (dx: number, w: number, h: number) => (
    <mesh key={dx} position={[dx, h / 2, 0.03]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#2a1c14" emissive="#ffb35a" emissiveIntensity={night * 0.25} />
    </mesh>
  );
  return (
    <group position={[x, 0, z - 6]}>
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[44, 8, 12]} />
        <meshStandardMaterial color={stone} map={front} roughness={0.95} />
      </mesh>
      <mesh position={[0, 6.6, 6.03]}>
        <planeGeometry args={[5.4, 1.7]} />
        <meshStandardMaterial
          map={plaque}
          emissiveMap={plaque}
          emissive="#ffffff"
          emissiveIntensity={0.2 + night * 0.4}
        />
      </mesh>
      {[-3.4, 3.4].map((dx) => (
        <RedLantern key={dx} position={[dx, 5.4, 7.2]} night={night} />
      ))}
      <group position={[0, 0, 6]}>
        {door(-7, 3, 4)}
        {door(7, 3, 4)}
        {/* the centre door is where the vault stands in the bridge */}
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 17, 4, 10]}>
          <boxGeometry args={[10, 8, 10]} />
          <meshStandardMaterial color={stone} map={wing} roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 8.15, 0]}>
        <boxGeometry args={[44.4, 0.3, 12.4]} />
        <meshStandardMaterial color="#7a6a58" />
      </mesh>
      {/* red columns of the pavilion */}
      {Array.from({ length: 10 }, (_, i) =>
        [-1, 1].map((s) => (
          <mesh key={`${i}${s}`} position={[-16.2 + i * 3.6, 9.8, s * 3.6]}>
            <cylinderGeometry args={[0.22, 0.22, 3.2, 10]} />
            <meshStandardMaterial color="#a4161a" />
          </mesh>
        )),
      )}
      <mesh position={[0, 9.8, 0]}>
        <boxGeometry args={[33, 3, 6.6]} />
        <meshStandardMaterial color="#c9a227" emissive="#ffcf6a" emissiveIntensity={night * 0.5} />
      </mesh>
      <PalaceRoof position={[0, 11.4, 0]} w={34} d={8} h={4.2} />
      <mesh position={[0, 13.8, 0]}>
        <boxGeometry args={[14, 2.4, 4.6]} />
        <meshStandardMaterial color="#a4161a" emissive="#ff8a4a" emissiveIntensity={night * 0.3} />
      </mesh>
      <PalaceRoof position={[0, 15.0, 0]} w={15} d={5.4} h={3.6} />
      {/* wing pavilions */}
      {[-1, 1].map((s) => (
        <PalaceRoof key={s} position={[s * 17, 8.3, 10]} w={8} d={8} h={3.4} />
      ))}
    </group>
  );
};

/** Kỳ Đài, the flag tower: three brick terraces and a very tall flagpole. */
export const FlagTower = ({ t }: { t: number }) => {
  const flag = useFlagTex();
  const brick = useStone(4, 1);
  const geometry = useMemo(() => new THREE.PlaneGeometry(9, 6, 12, 1), []);
  // The flag waves: displace the plane along z by a travelling sine.
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    pos.setZ(i, Math.sin(px * 0.8 - t * 4) * 0.35 * ((px + 4.5) / 9));
  }
  pos.needsUpdate = true;
  const tiers: [number, number, number, number][] = [
    [16, 4.5, 10, 0],
    [12, 3.5, 7.5, 4.5],
    [8.5, 3, 5, 8],
  ];
  return (
    <group position={[-30, 0, HUE.wall + 3]}>
      {tiers.map(([w, h, d, y], i) => (
        <group key={i}>
          <mesh position={[0, y + h / 2, 0]}>
            <boxGeometry args={[w, h, d]} />
            <meshStandardMaterial
              color={["#c08a6e", "#c9937a", "#d29c80"][i]}
              map={brick}
              roughness={0.95}
            />
          </mesh>
          {/* merlons along the parapet */}
          {Array.from({ length: Math.floor(w / 1.2) }, (_, k) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`${k}${sz}`}
                position={[-w / 2 + 0.6 + k * 1.2, y + h + 0.25, sz * (d / 2 - 0.2)]}
              >
                <boxGeometry args={[0.6, 0.5, 0.4]} />
                <meshStandardMaterial color="#8a5a44" />
              </mesh>
            )),
          )}
        </group>
      ))}
      <mesh position={[0, 11 + 13, 0]}>
        <cylinderGeometry args={[0.18, 0.3, 26, 10]} />
        <meshStandardMaterial color="#d8d8d8" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh geometry={geometry} position={[4.6, 34, 0]}>
        <meshStandardMaterial map={flag} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

/** The Citadel's outer wall along the north bank, with a gap for the gate. */
const CitadelWall = () => (
  <group>
    {[-1, 1].map((s) => (
      <group key={s}>
        <mesh position={[s * 42, 3.2, HUE.wall]}>
          <boxGeometry args={[70, 6.4, 4]} />
          <meshStandardMaterial color="#6f5a4a" roughness={1} />
        </mesh>
        <mesh position={[s * 42, 6.55, HUE.wall]}>
          <boxGeometry args={[70, 0.3, 4.2]} />
          <meshStandardMaterial color="#4f5a3a" roughness={1} />
        </mesh>
      </group>
    ))}
    {/* courtyard stone between the wall and the gate */}
    <Flat position={[0, 0.02, -116]} size={[40, 22]} color="#b8ab95" />
  </group>
);

/** Thiên Mụ: the seven-storey octagonal tower on the river bank. */
export const Pagoda = () => (
  <group position={[-100, 0, HUE.river1 - 10]}>
    <mesh scale={[1, 0.18, 1]}>
      <sphereGeometry args={[16, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#5f8f4a" roughness={1} />
    </mesh>
    {Array.from({ length: 7 }, (_, i) => {
      const r = 3.2 - i * 0.32;
      const y = 2.9 + i * 3.1;
      return (
        <group key={i} position={[0, y, 0]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[r, r, 2.8, 8]} />
            <meshStandardMaterial color="#e3c9a0" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.1, 0]} rotation={[0, Math.PI / 8, 0]}>
            <cylinderGeometry args={[r + 0.9, r + 0.5, 0.35, 8]} />
            <meshStandardMaterial color="#9c4a32" />
          </mesh>
          {Array.from({ length: 4 }, (_, k) => (
            <mesh
              key={k}
              position={[
                Math.sin((k * Math.PI) / 2) * (r + 0.01),
                1.5,
                Math.cos((k * Math.PI) / 2) * (r + 0.01),
              ]}
              rotation={[0, (k * Math.PI) / 2, 0]}
            >
              <planeGeometry args={[0.8, 1.4]} />
              <meshStandardMaterial color="#3a2418" />
            </mesh>
          ))}
        </group>
      );
    })}
    <mesh position={[0, 2.9 + 7 * 3.1 + 0.4, 0]} rotation={[0, Math.PI / 8, 0]}>
      <cylinderGeometry args={[1.4, 1.2, 0.35, 8]} />
      <meshStandardMaterial color="#9c4a32" />
    </mesh>
    <mesh position={[0, 2.9 + 7 * 3.1 + 2.2, 0]}>
      <coneGeometry args={[0.6, 3.4, 8]} />
      <meshStandardMaterial color="#d4a72c" metalness={0.6} roughness={0.3} />
    </mesh>
    <mesh position={[0, 1.4, 0]}>
      <cylinderGeometry args={[4.4, 4.6, 2.8, 8]} />
      <meshStandardMaterial color="#c9b08a" />
    </mesh>
  </group>
);

const CultureBanner = ({ position }: { position: V3 }) => {
  const map = useCanvasTexture(1024, 160, "culture-banner", (ctx, w, h) =>
    drawShopSign(ctx, w, h, ["NHÀ VĂN HÓA TRUNG TÂM", "Thành phố Huế"], ["#c1121f", "#ffd60a"]),
  );
  return (
    <mesh position={position} rotation={[0, Math.PI / 2, 0]}>
      <planeGeometry args={[10, 1.6]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
};

/** The two French-era buildings on the square: a yellow one (the office
 * is its top floor) and a red school. */
const Colonial = ({ night }: { night: number }) => {
  const winLit = useWindowTex(true);
  const winDark = useWindowTex(false);
  const [ox, oy, oz] = OFFICE;
  const front = oz - 2.3; // north face, where the office window is
  const back = oz + 9.7;
  const cz = (front + back) / 2;
  const D = back - front;
  const W = 18;
  const windows = (
    x0: number,
    z: number,
    floors: number,
    cols: number,
    w: number,
    skip?: (c: number, f: number) => boolean,
  ) =>
    Array.from({ length: floors }, (_, f) =>
      Array.from({ length: cols }, (_, c) => {
        if (skip?.(c, f)) return null;
        const on = night > 0.5 && rand(c * 7 + f * 3 + x0) > 0.4;
        return (
          <mesh
            key={`${f}${c}`}
            position={[x0 - w / 2 + (c + 0.5) * (w / cols), 1.6 + f * 4, z]}
            rotation={[0, z < cz ? Math.PI : 0, 0]}
          >
            <planeGeometry args={[1.2, 2.2]} />
            <meshStandardMaterial
              map={on ? winLit : winDark}
              emissiveMap={on ? winLit : undefined}
              emissive={on ? "#fff" : "#000"}
              emissiveIntensity={on ? 0.8 : 0}
            />
          </mesh>
        );
      }),
    );
  return (
    <group>
      {/* yellow building; its top floor is hollow for the office set */}
      <mesh position={[ox, (oy - 0.05) / 2, cz]}>
        <boxGeometry args={[W, oy - 0.05, D]} />
        <meshStandardMaterial color="#f3e3c3" roughness={0.9} />
      </mesh>
      {/* top floor shell: back, sides, and a front with the office window */}
      <mesh position={[ox, oy + 2, back - 0.15]}>
        <boxGeometry args={[W, 4, 0.3]} />
        <meshStandardMaterial color="#f3e3c3" roughness={0.9} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[ox + s * (W / 2 - 0.15), oy + 2, cz]}>
          <boxGeometry args={[0.3, 4, D]} />
          <meshStandardMaterial color="#f3e3c3" roughness={0.9} />
        </mesh>
      ))}
      {[-1, 1].map((s) => (
        <mesh key={`f${s}`} position={[ox + s * (W / 4 + 1.9), oy + 2, front + 0.15]}>
          <boxGeometry args={[W / 2 - 3.8, 4, 0.3]} />
          <meshStandardMaterial color="#f3e3c3" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[ox, oy + 0.2, front + 0.15]}>
        <boxGeometry args={[7.6, 0.4, 0.3]} />
        <meshStandardMaterial color="#f3e3c3" />
      </mesh>
      <mesh position={[ox, oy + 3.5, front + 0.15]}>
        <boxGeometry args={[7.6, 1, 0.3]} />
        <meshStandardMaterial color="#f3e3c3" />
      </mesh>
      <mesh position={[ox, oy + 4.1, cz]}>
        <boxGeometry args={[W + 0.6, 0.3, D + 0.6]} />
        <meshStandardMaterial color="#f3efe6" />
      </mesh>
      {/* the pediment over the entrance on the square side */}
      <Roof position={[ox, oy + 4.25, cz]} w={W} d={D} h={2.2} color="#b5523b" />
      {windows(ox, front - 0.01, 2, 6, W)}
      {windows(ox, back + 0.01, 3, 6, W)}
      {/* white arcade at the ground floor, toward the square (-x side) */}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={i} position={[ox - W / 2 - 1.1, 1.8, front + 1.2 + i * 2.4]}>
          <boxGeometry args={[0.4, 3.6, 0.4]} />
          <meshStandardMaterial color="#f3efe6" />
        </mesh>
      ))}
      <mesh position={[ox - W / 2 - 1.1, 3.75, cz]}>
        <boxGeometry args={[0.6, 0.3, D]} />
        <meshStandardMaterial color="#f3efe6" />
      </mesh>
      <mesh position={[ox - W / 2 - 0.6, 3.75, cz]}>
        <boxGeometry args={[1.2, 0.12, D]} />
        <meshStandardMaterial color="#b5523b" />
      </mesh>
      {/* Nhà Văn hóa Trung tâm: a white hall with fins and a red banner */}
      <group position={[-ox, 0, cz]}>
        <mesh position={[0, 4.5, 0]}>
          <boxGeometry args={[W, 9, D]} />
          <meshStandardMaterial color="#efece4" roughness={0.85} />
        </mesh>
        {Array.from({ length: 13 }, (_, i) => (
          <mesh key={i} position={[-W / 2 + 0.7 + i * ((W - 1.4) / 12), 4.5, -D / 2 - 0.25]}>
            <boxGeometry args={[0.25, 8.6, 0.5]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={`e${i}`} position={[W / 2 + 0.25, 4.5, -D / 2 + 0.8 + i * ((D - 1.6) / 8)]}>
            <boxGeometry args={[0.5, 8.6, 0.25]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        ))}
        <mesh position={[0, 9.15, 0]}>
          <boxGeometry args={[W + 0.6, 0.3, D + 0.6]} />
          <meshStandardMaterial color="#c9c4b8" />
        </mesh>
        <CultureBanner position={[W / 2 + 0.55, 6.6, 0]} />
      </group>
    </group>
  );
};

/** Phu Van Lau: the little two-tier pavilion on the north bank. */
const RiverPavilion = () => (
  <group position={[-14, 0, HUE.river1 - 3]}>
    <mesh position={[0, 0.3, 0]}>
      <boxGeometry args={[8, 0.6, 4.6]} />
      <meshStandardMaterial color="#9a917f" />
    </mesh>
    {[-3, -1, 1, 3].map((x) =>
      [-1.6, 1.6].map((z) => (
        <mesh key={`${x}${z}`} position={[x, 2, z]}>
          <cylinderGeometry args={[0.16, 0.16, 2.8, 8]} />
          <meshStandardMaterial color="#a4161a" />
        </mesh>
      )),
    )}
    <PalaceRoof position={[0, 3.3, 0]} w={7} d={3.6} h={1.8} />
    <mesh position={[0, 4.6, 0]}>
      <boxGeometry args={[3.4, 1.4, 2]} />
      <meshStandardMaterial color="#a4161a" />
    </mesh>
    <PalaceRoof position={[0, 5.2, 0]} w={3.8} d={2.4} h={1.4} />
  </group>
);

/** Lotus ponds either side of the Noon Gate's courtyard. */
const LotusPonds = () => (
  <group>
    {[-1, 1].map((sd) => (
      <group key={sd} position={[sd * 27, 0, -116]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <planeGeometry args={[12, 18]} />
          <meshStandardMaterial color="#2f6f5a" metalness={0.3} roughness={0.2} />
        </mesh>
        {Array.from({ length: 22 }, (_, i) => (
          <mesh
            key={i}
            position={[(rand(i * 3 + sd) - 0.5) * 10, 0.12, (rand(i * 7 + sd) - 0.5) * 16]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.45 + rand(i) * 0.3, 12]} />
            <meshStandardMaterial color="#4f9a4a" />
          </mesh>
        ))}
        {Array.from({ length: 10 }, (_, i) => (
          <mesh
            key={`f${i}`}
            position={[(rand(i * 11 + sd) - 0.5) * 9, 0.35, (rand(i * 13 + sd) - 0.5) * 15]}
          >
            <sphereGeometry args={[0.18, 10, 8]} />
            <meshStandardMaterial color="#f4a6b8" emissive="#f4a6b8" emissiveIntensity={0.2} />
          </mesh>
        ))}
      </group>
    ))}
  </group>
);

/* ---------------- the valley: hills, rooftops, trees ---------------- */

const Instanced = ({
  geometry,
  items,
  material,
}: {
  geometry: THREE.BufferGeometry;
  items: { p: V3; s: V3; r?: number; c: string }[];
  material: THREE.Material;
}) => {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, items.length);
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      o.position.set(...it.p);
      o.scale.set(...it.s);
      o.rotation.set(0, it.r ?? 0, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(it.c));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    return m;
  }, [geometry, items, material]);
  return <primitive object={mesh} />;
};

type Box = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  c: string;
  roof: string;
  r: number;
  tall: boolean;
};

/** Low-detail houses and trees filling the valley outside the streets we visit. */
function valley() {
  const houses: Box[] = [];
  const trees: { p: V3; s: V3; c: string }[] = [];
  const inside = (x: number, z: number) => {
    if (DISTRICTS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) return true;
    // his street block, the square and the river, the citadel courtyard
    if (x > HUE.x0 - 9 && x < HUE.x1 + 9 && z > -60 && z < 14) return true;
    if (z < HUE.river0 + 3 && z > HUE.river1 - 3) return true;
    if (Math.abs(x) < 30 && z < HUE.river1 && z > -150) return true;
    if (Math.hypot(x + 100, z - (HUE.river1 - 10)) < 20) return true;
    if (Math.abs(x + 30) < 12 && z < HUE.river1 && z > HUE.wall - 6) return true;
    return z < HUE.river1 && z > HUE.wall - 3;
  };
  let s = 0;
  for (let x = -190; x <= 190; x += 9)
    for (let z = -230; z <= 150; z += 9) {
      s++;
      const jx = x + (rand(s) - 0.5) * 4;
      const jz = z + (rand(s + 1) - 0.5) * 4;
      if (Math.hypot(jx - CENTER[0], jz - CENTER[2]) > 175) continue;
      if (inside(jx, jz)) continue;
      const citadel = jz < HUE.wall;
      if (rand(s + 2) < (citadel ? 0.65 : 0.3)) {
        trees.push({
          p: [jx, 2.5, jz],
          s: [1 + rand(s + 3), 0.8 + rand(s + 4) * 0.7, 1 + rand(s + 5)],
          c: ["#3f7d45", "#4f8f3f", "#2f6b3c", "#e8492b", "#5a9a4a"][Math.floor(rand(s + 6) * 5)],
        });
        continue;
      }
      const tall = !citadel && rand(s + 14) < 0.12;
      houses.push({
        x: jx,
        z: jz,
        w: 4.5 + rand(s + 7) * 3.5,
        d: 6 + rand(s + 8) * 3,
        h: citadel ? 3.5 : tall ? 16 + rand(s + 13) * 16 : 4 + Math.floor(rand(s + 9) * 3) * 3.2,
        c: citadel
          ? "#d9b48f"
          : tall
            ? ["#f3efe6", "#e9e4d8", "#dfe7ea"][Math.floor(rand(s + 15) * 3)]
            : WALLS[Math.floor(rand(s + 10) * WALLS.length)],
        tall,
        roof: citadel
          ? "#e8b32e"
          : ["#b5523b", "#c45a3c", "#8a4b3a", "#d8d2c4", "#6b7075"][Math.floor(rand(s + 11) * 5)],
        r: (rand(s + 12) - 0.5) * 0.3,
      });
    }
  return { houses, trees };
}

function hills() {
  const out: { p: V3; s: V3; c: string }[] = [];
  const n = 34;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const north = Math.max(0, -Math.cos(a)); // a=π points to -z
    const R = 215 + rand(i) * 35;
    const r = 48 + rand(i + 1) * 30;
    const h = 52 + rand(i + 2) * 42 - north * 8;
    out.push({
      p: [CENTER[0] + Math.sin(a) * R, 0, CENTER[2] + Math.cos(a) * R],
      s: [r, h, r * (0.8 + rand(i + 3) * 0.4)],
      c: ["#3d6b45", "#4a7a4f", "#557f52", "#36603f"][i % 4],
    });
  }
  // Ngự Bình, the flat-topped hill south of town
  out.push({ p: [40, 0, 175], s: [55, 70, 40], c: "#4a7a4f" });
  return out;
}

const VALLEY = valley();
const HILLS = hills();

const Valley = ({ night }: { night: number }) => {
  const res = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    const pyramid = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    pyramid.rotateY(Math.PI / 4);
    pyramid.translate(0, 0.5, 0);
    const blob = new THREE.SphereGeometry(1.6, 10, 8);
    const hill = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const lights = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const flat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({
      color: "#ffd28a",
      toneMapped: false,
      transparent: true,
    });
    return { box, pyramid, blob, hill, lights, mat, flat, glow };
  }, []);
  const walls = useMemo(
    () =>
      VALLEY.houses.map((h) => ({
        p: [h.x, 0, h.z] as V3,
        s: [h.w, h.h, h.d] as V3,
        r: h.r,
        c: h.c,
      })),
    [],
  );
  const roofs = useMemo(
    () =>
      VALLEY.houses.map((h) => ({
        p: [h.x, h.h, h.z] as V3,
        s: [h.w + 0.4, h.tall ? 0.5 : 1.6, h.d + 0.4] as V3,
        r: h.r,
        c: h.roof,
      })),
    [],
  );
  const lights = useMemo(
    () =>
      VALLEY.houses.flatMap((h, i) =>
        rand(i * 3.1) > 0.45
          ? [
              {
                p: [
                  h.x + Math.sin(h.r) * (h.d / 2 + 0.05),
                  Math.min(h.h - 1, 1.6 + Math.floor(rand(i) * 3) * 3.2),
                  h.z + Math.cos(h.r) * (h.d / 2 + 0.05),
                ] as V3,
                s: [1.2, 1.4, 1] as V3,
                r: h.r,
                c: "#ffd28a",
              },
            ]
          : [],
      ),
    [],
  );
  res.glow.opacity = Math.min(1, night * 1.4);
  return (
    <group>
      <Instanced geometry={res.box} items={walls} material={res.mat} />
      <Instanced geometry={res.pyramid} items={roofs} material={res.flat} />
      <Instanced geometry={res.blob} items={VALLEY.trees} material={res.mat} />
      <Instanced geometry={res.hill} items={HILLS} material={res.mat} />
      {night > 0.05 && <Instanced geometry={res.lights} items={lights} material={res.glow} />}
    </group>
  );
};

/* ---------------- the whole town ---------------- */

export type TownProps = {
  t: number;
  night: number;
  lit?: (house: number, window: number) => boolean;
  /** Far-side lots to leave empty: an x, or an [x0, x1] range. */
  skipAcross?: (number | [number, number])[];
  /** Point lights on the lamps nearest the action. */
  lamps?: boolean;
};

const skipped = (lot: Lot, skip: (number | [number, number])[]) =>
  skip.some((s) =>
    typeof s === "number"
      ? Math.abs(lot.x - s) < lot.w / 2 + 3.1
      : lot.x + lot.w / 2 > s[0] && lot.x - lot.w / 2 < s[1],
  );

/** The houses' lit windows as one string, so the town only re-renders
 * when a light actually changes. */
const WINDOWS = [0, 1, 2, 3, 4, 5, 50, 51, 52, 53, 54, 55, 56, 57, 99];
function litKey(lit: (house: number, window: number) => boolean) {
  let key = "";
  const add = (count: number, offset: number) => {
    for (let i = 0; i < count; i++) for (const w of WINDOWS) key += lit(i + offset, w) ? "1" : "0";
  };
  add(NEAR.length, 0);
  add(ACROSS.length, 20);
  add(BACK.length, 40);
  return key;
}

/**
 * Keeps a static subtree's matrices out of the per-frame update: after each
 * (rare) render it bakes every object's matrix once and switches off
 * matrixAutoUpdate. Saves thousands of matrix compositions per frame.
 */
const Frozen = ({ children }: { children: ReactNode }) => {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    ref.current?.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
  });
  return <group ref={ref}>{children}</group>;
};

type StaticProps = {
  night: number;
  lit: (house: number, window: number) => boolean;
  litKey: string;
  skipAcross: (number | [number, number])[];
  skipKey: string;
  lamps: boolean;
};

/** Everything in town that doesn't move: rendered again only when the
 * time of day (in 2% steps), the lit windows or the empty lots change. */
const StaticTown = memo(
  ({ night, lit, skipAcross, lamps }: StaticProps) => {
    const grass = new THREE.Color("#7cae5a").lerp(new THREE.Color("#22382a"), night).getStyle();
    const poles = [-46, -30, -14, 2, 18, 34, 50];
    return (
      <Frozen>
        <Ground grass={grass} night={night} />
        {NEAR.map((lot, i) => (
          <TubeHouse
            key={`n${i}`}
            spec={lot.spec}
            position={[lot.x, 0, HUE.nearFront + lot.spec.d / 2]}
            lit={(w) => lit(i, w)}
            night={night}
          />
        ))}
        {ACROSS.map((lot, i) =>
          skipped(lot, skipAcross) ? null : (
            <TubeHouse
              key={`a${i}`}
              spec={lot.spec}
              position={[lot.x, 0, HUE.acrossFront - lot.spec.d / 2]}
              rotation={Math.PI}
              lit={(w) => lit(i + 20, w)}
              night={night}
            />
          ),
        )}
        {BACK.map((lot, i) => (
          <TubeHouse
            key={`b${i}`}
            spec={lot.spec}
            position={[lot.x, 0, HUE.nearFront + 8.4 + lot.spec.d / 2]}
            rotation={Math.PI}
            lit={(w) => lit(i + 40, w)}
            night={night}
            detail={false}
          />
        ))}
        {poles.map((x) => (
          <Pole key={x} position={[x, 0, -10.75]} />
        ))}
        <Wires xs={POLES} z={-10.75} />
        {/* the square: flame trees, lamps, flower beds */}
        {[-28, -21, 21, 28].map((x, i) => (
          <FlameTree key={x} position={[x, 0, -28]} s={1.1} seed={i} />
        ))}
        {[-26, -18, 18, 26].map((x, i) => (
          <FlameTree key={`r${x}`} position={[x, 0, -51]} s={1.2} seed={i + 4} />
        ))}
        {[-14, -7, 7, 14].map((x, i) => (
          <LampPost key={x} position={[x, 0, -26.2]} on={night} light={lamps && i % 3 === 0} />
        ))}
        {[-30, -20, -10, 10, 20, 30].map((x) => (
          <LampPost key={`b${x}`} position={[x, 0, -53.8]} on={night} />
        ))}
        {[-38, -22, 22, 38].map((x, i) => (
          <LampPost
            key={`s${x}`}
            position={[x, 0, -5.2]}
            on={night}
            light={lamps && (i === 1 || i === 2)}
          />
        ))}
        <Colonial night={night} />
        <CitadelWall />
        <NoonGate night={night} />
        <Pagoda />
        <RiverPavilion />
        <LotusPonds />
        <HueDistricts night={night} />
        <Bandstand position={[-25, 0, -43.5]} />
        <FloatingRestaurant night={night} />
        <Valley night={night} />
      </Frozen>
    );
  },
  (a, b) =>
    a.night === b.night && a.litKey === b.litKey && a.skipKey === b.skipKey && a.lamps === b.lamps,
);
const POLES = [-46, -30, -14, 2, 18, 34, 50];

export const HueTown = ({
  t,
  night,
  lit = () => false,
  skipAcross = [],
  lamps = true,
}: TownProps) => {
  // At night the town sleeps, all but a few people still stuck on an idea:
  // their window stays lit and the thought hangs outside it.
  const awake = night > 0.6;
  const litAll = (h: number, w: number) =>
    (awake && STUCK.some((s) => s.house === h && w === 0)) || lit(h, w);
  return (
    <group>
      <StaticTown
        night={Math.round(night * 50) / 50}
        lit={litAll}
        litKey={litKey(litAll)}
        skipAcross={skipAcross}
        skipKey={JSON.stringify(skipAcross)}
        lamps={lamps}
      />
      {/* the moving parts: water, bridge lights, the flag, the Avalanche coins */}
      <River t={t} night={night} />
      <Bridge t={t} night={night} />
      <FlagTower t={t} />
      <AvalancheLogo
        position={[30, 30, -76]}
        scale={4}
        spin={Math.sin(t * 0.5) * 0.45}
        glow={0.4 + night * 1.2}
      />
      {[-1, 1].map((s) => (
        <AvalancheLogo
          key={s}
          position={[HUE.bridgeX + s * 3.7, 4.9, (HUE.river0 + HUE.river1) / 2]}
          scale={1.1}
          spin={Math.PI / 2}
          glow={0.4 + night * 1.4}
        />
      ))}
      {awake &&
        STUCK.map((s, i) => (
          <group key={i} position={s.at}>
            <ThoughtBubble t={t + i * 1.7} scale={0.85} />
          </group>
        ))}
    </group>
  );
};

/** The neighbours still awake at night, stuck on an idea (house index as
 * passed to `lit`, and where the thought hangs outside their window). */
const STUCK = [
  ...[2, 9].map((i) => {
    const lot = NEAR[i];
    const x = lot.x - (lot.spec.w > 4.6 ? lot.spec.w * 0.24 : 0);
    return { house: i, at: [x, 5.2, HUE.nearFront + lot.spec.setback - 0.9] as V3 };
  }),
  ...[4, 13, 18].map((i) => {
    const lot = ACROSS[i];
    const x = lot.x + (lot.spec.w > 4.6 ? lot.spec.w * 0.24 : 0);
    return { house: i + 20, at: [x, 5.2, HUE.acrossFront + lot.spec.setback + 0.9] as V3 };
  }),
];
