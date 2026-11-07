import { useMemo } from "react";
import * as THREE from "three";
import { drawShopSign, Flat, PalaceRoof, useFlagTex, useWindowTex } from "./hue";
import { DONG_DA, HUNG_VUONG, RIVER_ROAD, SCHOOLS, type SchoolId } from "./hue-map";
import { Roof } from "./props";
import { rand, useCanvasTexture, type V3 } from "./stage";

// The schools of Huế and the boulevards they stand on, after street-view
// photos: Đống Đa with its hedge-and-palm median and grey lamp posts, Cao
// Thắng's pink wall and red sign, ĐH Khoa học's long white-and-green block,
// Nguyễn Trường Tộ's tiled gate arch, Quốc Học in red on Lê Lợi.

type Gate = "pillars" | "tile-arch" | "modern";
type SchoolStyle = {
  title: [string, string];
  wall: string;
  trim: string;
  band?: string;
  floors: number;
  w: number;
  d: number;
  roof: "tile" | "hip" | "flat";
  roofColor?: string;
  arches?: boolean;
  fence: string;
  gate: Gate;
  gateColor: string;
  sign: [string, string];
};

const STYLES: Record<SchoolId, SchoolStyle> = {
  quocHoc: {
    title: ["TRƯỜNG THPT CHUYÊN QUỐC HỌC", "Huế"],
    wall: "#a23a2e",
    trim: "#f3efe6",
    floors: 2,
    w: 26,
    d: 10,
    roof: "tile",
    roofColor: "#6e3b2a",
    arches: true,
    fence: "#a23a2e",
    gate: "tile-arch",
    gateColor: "#a23a2e",
    sign: ["#a4161a", "#ffd60a"],
  },
  haiBaTrung: {
    title: ["TRƯỜNG THPT HAI BÀ TRƯNG", "Huế"],
    wall: "#f0cf7a",
    trim: "#ffffff",
    floors: 2,
    w: 26,
    d: 10,
    roof: "tile",
    roofColor: "#9c4a32",
    arches: true,
    fence: "#f0cf7a",
    gate: "tile-arch",
    gateColor: "#f0cf7a",
    sign: ["#1d3b5c", "#ffffff"],
  },
  caoThang: {
    title: ["TRƯỜNG THPT CAO THẮNG", "11 Đống Đa"],
    wall: "#f2d06b",
    trim: "#ffffff",
    floors: 3,
    w: 30,
    d: 8,
    roof: "tile",
    roofColor: "#b5523b",
    fence: "#e9a08e",
    gate: "pillars",
    gateColor: "#e9a08e",
    sign: ["#c1121f", "#ffd60a"],
  },
  nguyenChiDieu: {
    title: ["TRƯỜNG THCS NGUYỄN CHÍ DIỄU", "Đống Đa"],
    wall: "#f4d58d",
    trim: "#ffffff",
    floors: 3,
    w: 24,
    d: 8,
    roof: "tile",
    roofColor: "#9c4a32",
    fence: "#efe6d2",
    gate: "pillars",
    gateColor: "#efe6d2",
    sign: ["#1d4e89", "#ffffff"],
  },
  khoaHoc: {
    title: ["TRƯỜNG ĐẠI HỌC KHOA HỌC", "Đại học Huế"],
    wall: "#f1f3ee",
    trim: "#ffffff",
    band: "#bfe0c8",
    floors: 3,
    w: 48,
    d: 10,
    roof: "flat",
    fence: "#d9d9d4",
    gate: "modern",
    gateColor: "#f1f3ee",
    sign: ["#1d3b5c", "#ffffff"],
  },
  nguyenTruongTo: {
    title: ["TRƯỜNG THPT NGUYỄN TRƯỜNG TỘ", "Huế"],
    wall: "#f2c94c",
    trim: "#ffffff",
    floors: 4,
    w: 24,
    d: 10,
    roof: "tile",
    roofColor: "#b5523b",
    arches: true,
    fence: "#f2c94c",
    gate: "tile-arch",
    gateColor: "#f2c94c",
    sign: ["#1d4e89", "#ffd60a"],
  },
  nguyenHue: {
    title: ["TRƯỜNG THPT NGUYỄN HUỆ", "83 Đinh Tiên Hoàng"],
    wall: "#f6d37a",
    trim: "#ffffff",
    floors: 3,
    w: 24,
    d: 9,
    roof: "hip",
    roofColor: "#6b7075",
    fence: "#f3efe6",
    gate: "pillars",
    gateColor: "#f3efe6",
    sign: ["#1d4e89", "#ffffff"],
  },
  nguyenTriPhuong: {
    title: ["TRƯỜNG THCS NGUYỄN TRI PHƯƠNG", "Tố Hữu"],
    wall: "#f4f4f0",
    trim: "#ffffff",
    band: "#d8dde2",
    floors: 3,
    w: 26,
    d: 9,
    roof: "flat",
    fence: "#e9e9e4",
    gate: "modern",
    gateColor: "#f4f4f0",
    sign: ["#8f2d26", "#ffffff"],
  },
  chuVanAn: {
    title: ["TRƯỜNG THCS CHU VĂN AN", "Xuân Phú"],
    wall: "#f5e1a4",
    trim: "#ffffff",
    band: "#7fb3d5",
    floors: 3,
    w: 22,
    d: 8,
    roof: "flat",
    fence: "#cfe3f0",
    gate: "pillars",
    gateColor: "#7fb3d5",
    sign: ["#1d4e89", "#ffffff"],
  },
};

const FLOOR = 3.6;
const YARD = 3.8;

export const Board = ({
  text,
  colors,
  position,
  rotation = 0,
  w,
  h = 1.1,
}: {
  text: [string, string];
  colors: [string, string];
  position: V3;
  rotation?: number;
  w: number;
  h?: number;
}) => {
  const cw = Math.round(((w / h) * 128) / 32) * 32;
  const map = useCanvasTexture(cw, 128, `board-${text[0]}-${colors[0]}-${cw}`, (ctx, x, y) =>
    drawShopSign(ctx, x, y, text, colors),
  );
  return (
    <mesh position={position} rotation={[0, rotation, 0]}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.35}
      />
    </mesh>
  );
};

/** An arched window, frame and panes. */
function useArchTex(lit: boolean) {
  return useCanvasTexture(128, 192, `arch-${lit}`, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, w / 2);
    ctx.arc(w / 2, w / 2, w / 2, Math.PI, 0);
    ctx.lineTo(w, h);
    ctx.fill();
    ctx.fillStyle = lit ? "#ffd58a" : "#2a4560";
    ctx.beginPath();
    ctx.moveTo(10, h - 8);
    ctx.lineTo(10, w / 2);
    ctx.arc(w / 2, w / 2, w / 2 - 10, Math.PI, 0);
    ctx.lineTo(w - 10, h - 8);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(w / 2 - 3, 20, 6, h);
    ctx.fillRect(10, h * 0.55, w - 20, 6);
  });
}

const FlagPole = ({ position }: { position: V3 }) => {
  const flag = useFlagTex();
  return (
    <group position={position}>
      <mesh position={[0, 2.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 4.4, 6]} />
        <meshStandardMaterial color="#d8d8d8" />
      </mesh>
      <mesh position={[0.5, 4.0, 0]}>
        <planeGeometry args={[0.9, 0.6]} />
        <meshStandardMaterial map={flag} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
};

const GateBlock = ({ s }: { s: SchoolStyle }) => {
  if (s.gate === "pillars")
    return (
      <group>
        {[-3.4, 3.4].map((x) => (
          <mesh key={x} position={[x, 1.7, 0]}>
            <boxGeometry args={[0.8, 3.4, 0.8]} />
            <meshStandardMaterial color={s.gateColor} />
          </mesh>
        ))}
        <mesh position={[0, 3.6, 0]}>
          <boxGeometry args={[7.6, 1.0, 0.4]} />
          <meshStandardMaterial color={s.sign[0]} />
        </mesh>
        <Board text={s.title} colors={s.sign} position={[0, 3.6, 0.22]} w={7.2} h={0.9} />
        {/* the sliding gates, pushed open */}
        {[-1, 1].map((sd) => (
          <mesh key={sd} position={[sd * 4.9, 0.9, -0.2]}>
            <boxGeometry args={[2.8, 1.6, 0.08]} />
            <meshStandardMaterial color="#1d6fd0" />
          </mesh>
        ))}
      </group>
    );
  if (s.gate === "tile-arch")
    return (
      <group>
        {[-3.3, 3.3].map((x) => (
          <mesh key={x} position={[x, 1.9, 0]}>
            <boxGeometry args={[1.0, 3.8, 1.0]} />
            <meshStandardMaterial color={s.gateColor} />
          </mesh>
        ))}
        <mesh position={[0, 4.3, 0]}>
          <boxGeometry args={[7.6, 1.2, 0.7]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <Board text={s.title} colors={s.sign} position={[0, 4.3, 0.37]} w={6.8} h={0.9} />
        <Roof position={[0, 4.9, 0]} w={8.6} d={2.2} h={1.1} color="#b5523b" />
      </group>
    );
  return (
    <group>
      {[-3.6, 3.6].map((x) => (
        <mesh key={x} position={[x, 2.1, 0]}>
          <boxGeometry args={[0.5, 4.2, 0.6]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}
      <mesh position={[0, 4.35, 0]} rotation={[0.12, 0, 0]}>
        <boxGeometry args={[9.6, 0.25, 3]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {/* the red signboard on its stand in front */}
      <mesh position={[-6.4, 1.0, 1.4]}>
        <boxGeometry args={[4.4, 1.8, 0.25]} />
        <meshStandardMaterial color={s.sign[0]} />
      </mesh>
      <Board text={s.title} colors={s.sign} position={[-6.4, 1.0, 1.54]} w={4.2} h={1.5} />
    </group>
  );
};

/** One school: the building, a yard, a fence along the street and a gate. */
export const School = ({ id, night }: { id: SchoolId; night: number }) => {
  const s = STYLES[id];
  const { at, yaw } = SCHOOLS[id];
  const winLit = useWindowTex(true);
  const winDark = useWindowTex(false);
  const archLit = useArchTex(true);
  const archDark = useArchTex(false);
  const H = s.floors * FLOOR;
  const front = s.d / 2;
  const cols = Math.floor(s.w / 3);
  const fenceZ = front + YARD;
  return (
    <group position={at} rotation={[0, yaw, 0]}>
      <mesh position={[0, H / 2, 0]}>
        <boxGeometry args={[s.w, H, s.d]} />
        <meshStandardMaterial color={s.wall} roughness={0.9} />
      </mesh>
      {/* a corridor band and windows on every floor */}
      {Array.from({ length: s.floors }, (_, f) => (
        <group key={f}>
          <mesh position={[0, f * FLOOR + 0.15, front + 0.08]}>
            <boxGeometry args={[s.w + 0.1, 0.3, 0.2]} />
            <meshStandardMaterial color={s.band ?? s.trim} />
          </mesh>
          {Array.from({ length: cols }, (_, c) => {
            const x = -s.w / 2 + (c + 0.5) * (s.w / cols);
            const on = night > 0.5 && rand(c * 7 + f * 3 + s.w) > 0.55;
            const map = s.arches ? (on ? archLit : archDark) : on ? winLit : winDark;
            return (
              <mesh key={c} position={[x, f * FLOOR + 1.75, front + 0.03]}>
                <planeGeometry args={[1.3, 2.1]} />
                <meshStandardMaterial
                  map={map}
                  transparent={s.arches}
                  alphaTest={s.arches ? 0.5 : 0}
                  emissiveMap={on ? map : undefined}
                  emissive={on ? "#ffffff" : "#000000"}
                  emissiveIntensity={on ? 0.8 : 0}
                />
              </mesh>
            );
          })}
        </group>
      ))}
      {/* the centre bay with the school's name */}
      <mesh position={[0, (H + 1.2) / 2, 0.3]}>
        <boxGeometry args={[Math.min(9, s.w * 0.3), H + 1.2, s.d + 0.6]} />
        <meshStandardMaterial color={s.arches ? s.trim : s.wall} roughness={0.9} />
      </mesh>
      <Board
        text={s.title}
        colors={s.sign}
        position={[0, H - 0.2, front + 0.63]}
        w={Math.min(8.6, s.w * 0.29)}
        h={0.9}
      />
      {s.roof === "tile" && (
        <>
          <Roof position={[0, H, 0]} w={s.w + 0.8} d={s.d + 1.2} h={2.6} color={s.roofColor!} />
          <Roof
            position={[0, H + 1.2, 0.3]}
            w={Math.min(9.4, s.w * 0.32)}
            d={s.d + 1.8}
            h={2.4}
            color={s.roofColor!}
          />
        </>
      )}
      {s.roof === "hip" && (
        <PalaceRoof position={[0, H, 0]} w={s.w - 1} d={s.d - 1} h={2.6} color={s.roofColor} />
      )}
      {s.roof === "flat" && (
        <mesh position={[0, H + 0.45, 0]}>
          <boxGeometry args={[s.w + 0.2, 0.9, s.d + 0.2]} />
          <meshStandardMaterial color={s.band ?? s.trim} />
        </mesh>
      )}
      {/* yard trees */}
      {[-1, 1].map((sd) => (
        <group key={sd} position={[sd * (s.w / 2 - 3), 0, front + 2]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.15, 0.22, 2.8, 8]} />
            <meshStandardMaterial color="#5a3d2b" />
          </mesh>
          <mesh position={[0, 3.6, 0]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[2.2, 12, 8]} />
            <meshStandardMaterial color="#4f8f3f" roughness={1} />
          </mesh>
        </group>
      ))}
      {/* fence either side of the gate, flags along it */}
      {[-1, 1].map((sd) => (
        <mesh key={sd} position={[sd * (s.w / 4 + 2.15), 0.6, fenceZ]}>
          <boxGeometry args={[s.w / 2 - 4.3, 1.2, 0.25]} />
          <meshStandardMaterial color={s.fence} />
        </mesh>
      ))}
      {[-0.42, -0.3, 0.3, 0.42].map((k) => (
        <FlagPole key={k} position={[k * s.w, 1.2, fenceZ]} />
      ))}
      <group position={[0, 0, fenceZ]}>
        <GateBlock s={s} />
      </group>
    </group>
  );
};

/* ---------------- boulevards ---------------- */

/** A fan palm: a slim trunk and a crown of drooping fronds. */
const Palm = ({ position, h = 6 }: { position: V3; h?: number }) => (
  <group position={position}>
    <mesh position={[0, h / 2, 0]}>
      <cylinderGeometry args={[0.12, 0.2, h, 8]} />
      <meshStandardMaterial color="#7a6a55" />
    </mesh>
    {Array.from({ length: 8 }, (_, i) => (
      <mesh
        key={i}
        position={[Math.sin((i * Math.PI) / 4) * 0.9, h - 0.2, Math.cos((i * Math.PI) / 4) * 0.9]}
        rotation={[0.9, (i * Math.PI) / 4, 0]}
      >
        <boxGeometry args={[0.5, 0.04, 2.2]} />
        <meshStandardMaterial color="#3f7d45" />
      </mesh>
    ))}
  </group>
);

/** The grey cast-iron lamp posts of Đống Đa's median. */
const MedianLamp = ({
  position,
  rotation = 0,
  on,
}: {
  position: V3;
  rotation?: number;
  on: number;
}) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.4, 0]}>
      <cylinderGeometry args={[0.3, 0.36, 0.8, 10]} />
      <meshStandardMaterial color="#9aa3a6" />
    </mesh>
    <mesh position={[0, 4, 0]}>
      <cylinderGeometry args={[0.1, 0.16, 7, 10]} />
      <meshStandardMaterial color="#9aa3a6" />
    </mesh>
    {[-1, 1].map((s) => (
      <group key={s}>
        <mesh position={[s * 0.9, 7.3, 0]}>
          <boxGeometry args={[1.8, 0.08, 0.08]} />
          <meshStandardMaterial color="#9aa3a6" />
        </mesh>
        <mesh position={[s * 1.75, 7.15, 0]}>
          <boxGeometry args={[0.5, 0.16, 0.26]} />
          <meshBasicMaterial color={on > 0.5 ? "#fff1c4" : "#d9d9d4"} toneMapped={false} />
        </mesh>
      </group>
    ))}
  </group>
);

const ShadeTree = ({ position, s = 1 }: { position: V3; s?: number }) => (
  <group position={position} scale={s}>
    <mesh position={[0, 1.6, 0]}>
      <cylinderGeometry args={[0.18, 0.28, 3.2, 8]} />
      <meshStandardMaterial color="#5a4632" />
    </mesh>
    <mesh position={[0, 4.4, 0]} scale={[1.2, 0.7, 1.2]}>
      <sphereGeometry args={[2.4, 12, 8]} />
      <meshStandardMaterial color="#4a8a3c" roughness={1} />
    </mesh>
  </group>
);

const GATE_XS = (Object.keys(SCHOOLS) as SchoolId[])
  .map((id) => SCHOOLS[id])
  .filter((s) => Math.abs(s.at[2] - DONG_DA.z) < 25)
  .map((s) => s.at[0]);
const nearGate = (x: number) => GATE_XS.some((g) => Math.abs(g - x) < 6);

/** Đống Đa and Hùng Vương: two carriageways each side of a planted median. */
const Boulevards = ({ night }: { night: number }) => {
  const asphalt = night > 0.5 ? "#23262b" : "#3d4045";
  const walk = "#c9bfae";
  const dd = DONG_DA;
  const ddLen = dd.x1 - dd.x0;
  const ddX = (dd.x0 + dd.x1) / 2;
  const hv = HUNG_VUONG;
  const hvLen = hv.z1 - hv.z0;
  const hvZ = (hv.z0 + hv.z1) / 2;
  const medianXs = useMemo(
    () => Array.from({ length: Math.floor(ddLen / 12) }, (_, i) => dd.x0 + 6 + i * 12),
    [ddLen, dd.x0],
  );
  return (
    <group>
      {/* Đống Đa */}
      <Flat position={[ddX, 0, dd.z]} size={[ddLen, dd.half * 2]} color={asphalt} />
      <Flat position={[ddX, 0.04, dd.z - dd.half - 0.9]} size={[ddLen, 1.8]} color={walk} />
      <Flat position={[ddX, 0.04, dd.z + dd.half + 0.9]} size={[ddLen, 1.8]} color={walk} />
      {[-1, 1].map((sd) =>
        Array.from({ length: Math.floor(ddLen / 5) }, (_, i) => (
          <Flat
            key={`${sd}${i}`}
            position={[dd.x0 + 2.5 + i * 5, 0.025, dd.z + sd * 2.6]}
            size={[2, 0.12]}
            color="#e8e2c8"
          />
        )),
      )}
      {[
        [dd.x0, hv.x - hv.half],
        [hv.x + hv.half, dd.x1],
      ].map(([a, b]) => (
        <mesh key={a} position={[(a + b) / 2, 0.3, dd.z]}>
          <boxGeometry args={[b - a, 0.6, dd.median * 2]} />
          <meshStandardMaterial color="#3f7d45" roughness={1} />
        </mesh>
      ))}
      {medianXs.map((x, i) =>
        Math.abs(x - hv.x) < hv.half + 2 ? null : i % 2 ? (
          <Palm key={x} position={[x, 0.6, dd.z]} h={5 + rand(i) * 1.5} />
        ) : (
          <MedianLamp key={x} position={[x, 0.6, dd.z]} on={night} />
        ),
      )}
      {medianXs.map((x, i) =>
        Math.abs(x - hv.x) < hv.half + 3 || i % 2 || nearGate(x - 2) || nearGate(x + 3) ? null : (
          <group key={`t${x}`}>
            <ShadeTree position={[x + 3, 0, dd.z - dd.half - 1.2]} s={0.9 + rand(i) * 0.3} />
            <ShadeTree position={[x - 2, 0, dd.z + dd.half + 1.2]} s={0.9 + rand(i + 3) * 0.3} />
          </group>
        ),
      )}
      {/* Hùng Vương, from the bridge south, blue railings down the median */}
      <Flat position={[hv.x, 0.012, hvZ]} size={[hv.half * 2, hvLen]} color={asphalt} />
      <Flat position={[hv.x + hv.half + 1.25, 0.04, hvZ]} size={[2.5, hvLen]} color={walk} />
      {[
        [hv.z0 + 2, dd.z - dd.half - 2],
        [dd.z + dd.half + 2, hv.z1],
      ].map(([a, b]) => (
        <group key={a}>
          <mesh position={[hv.x, 0.45, (a + b) / 2]}>
            <boxGeometry args={[0.12, 0.9, b - a]} />
            <meshStandardMaterial color="#2a6fdb" />
          </mesh>
          <mesh position={[hv.x, 0.93, (a + b) / 2]}>
            <boxGeometry args={[0.16, 0.08, b - a]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        </group>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <MedianLamp
          key={i}
          position={[hv.x, 0, hv.z0 + 10 + i * 20]}
          rotation={Math.PI / 2}
          on={night}
        />
      ))}
      {/* Lê Lợi carries on west past the two old schools */}
      <Flat
        position={[(RIVER_ROAD.x0 - 58) / 2, 0, RIVER_ROAD.z]}
        size={[-58 - RIVER_ROAD.x0, 4.4]}
        color={asphalt}
      />
    </group>
  );
};

/* ---------------- tall buildings ---------------- */

function useFacade(kind: "glass" | "white") {
  return useCanvasTexture(128, 128, `facade-${kind}`, (ctx, w, h) => {
    ctx.fillStyle = kind === "glass" ? "#6f8ca3" : "#f3efe6";
    ctx.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle =
          kind === "glass" ? (rand(r * 4 + c) > 0.5 ? "#9fb8cc" : "#5b768c") : "#4a6378";
        if (kind === "glass") ctx.fillRect(c * 32 + 1, r * 32 + 1, 30, 30);
        else ctx.fillRect(c * 32 + 9, r * 32 + 7, 14, 20);
      }
  });
}

const Tower = ({
  position,
  size,
  kind,
  night,
  yaw = 0,
}: {
  position: V3;
  size: V3;
  kind: "glass" | "white";
  night: number;
  yaw?: number;
}) => {
  const base = useFacade(kind);
  const floors = Math.round(size[1] / 3.3);
  const tex = useMemo(() => {
    const t = base.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(Math.max(1, Math.round(size[0] / 6)), floors / 4);
    t.needsUpdate = true;
    return t;
  }, [base, floors, size]);
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <mesh position={[0, size[1] / 2, 0]}>
        <boxGeometry args={size} />
        <meshStandardMaterial
          map={tex}
          metalness={kind === "glass" ? 0.6 : 0}
          roughness={kind === "glass" ? 0.2 : 0.8}
          emissive="#ffd28a"
          emissiveIntensity={night * 0.35}
          emissiveMap={tex}
        />
      </mesh>
      {kind === "glass" ? (
        // the slanted crown
        <mesh position={[0, size[1] + 5, -size[2] * 0.15]} rotation={[0.35, 0, 0]}>
          <boxGeometry args={[size[0] * 0.9, 12, size[2] * 0.55]} />
          <meshStandardMaterial color="#8fa6b8" metalness={0.7} roughness={0.2} />
        </mesh>
      ) : (
        <mesh position={[0, size[1] + 1.2, 0]}>
          <boxGeometry args={[size[0] * 0.8, 2.4, size[2] * 0.8]} />
          <meshStandardMaterial color="#5c6670" />
        </mesh>
      )}
    </group>
  );
};

/* ---------------- the riverside park ---------------- */

/** The round bandstand in the park. */
export const Bandstand = ({ position }: { position: V3 }) => (
  <group position={position}>
    <mesh position={[0, 0.3, 0]}>
      <cylinderGeometry args={[3.2, 3.4, 0.6, 24]} />
      <meshStandardMaterial color="#e9e4d8" />
    </mesh>
    {Array.from({ length: 8 }, (_, i) => (
      <mesh
        key={i}
        position={[Math.sin((i * Math.PI) / 4) * 2.8, 2, Math.cos((i * Math.PI) / 4) * 2.8]}
      >
        <cylinderGeometry args={[0.1, 0.1, 2.8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    ))}
    <mesh position={[0, 4.1, 0]}>
      <coneGeometry args={[3.8, 1.8, 16]} />
      <meshStandardMaterial color="#2f7d63" roughness={0.6} />
    </mesh>
  </group>
);

/** The round white floating restaurant moored off the park. */
export const FloatingRestaurant = ({ night }: { night: number }) => (
  <group position={[-40, -0.5, -61.5]}>
    <mesh position={[0, 0.5, 0]}>
      <cylinderGeometry args={[6, 5.6, 1.2, 32]} />
      <meshStandardMaterial color="#f3efe6" />
    </mesh>
    <mesh position={[0, 2, 0]}>
      <cylinderGeometry args={[5.2, 5.2, 2, 32, 1, true]} />
      <meshStandardMaterial
        color="#c9d6dc"
        emissive="#ffd28a"
        emissiveIntensity={0.15 + night * 0.9}
        side={THREE.DoubleSide}
      />
    </mesh>
    <mesh position={[0, 3.1, 0]}>
      <cylinderGeometry args={[5.6, 5.6, 0.25, 32]} />
      <meshStandardMaterial color="#ffffff" />
    </mesh>
    <mesh position={[0, 4, 0]}>
      <cylinderGeometry args={[3.6, 3.6, 1.6, 24]} />
      <meshStandardMaterial
        color="#e9e4d8"
        emissive="#ffd28a"
        emissiveIntensity={0.1 + night * 0.8}
      />
    </mesh>
    <mesh position={[0, 5.2, 0]}>
      <coneGeometry args={[4, 1.2, 24]} />
      <meshStandardMaterial color="#b5523b" />
    </mesh>
  </group>
);

/** All of it: schools, boulevards, the tower at the end of Đống Đa. */
export const HueDistricts = ({ night }: { night: number }) => (
  <group>
    <Boulevards night={night} />
    {(Object.keys(SCHOOLS) as SchoolId[]).map((id) => (
      <School key={id} id={id} night={night} />
    ))}
    {/* the glass tower at the end of Đống Đa, white hotels on Hùng Vương */}
    <Tower position={[138, 0, 33]} size={[18, 116, 26]} kind="glass" night={night} />
    <Tower
      position={[80, 0, -12]}
      size={[16, 40, 22]}
      kind="white"
      night={night}
      yaw={Math.PI / 2}
    />
    <Tower
      position={[80, 0, 62]}
      size={[14, 34, 18]}
      kind="white"
      night={night}
      yaw={Math.PI / 2}
    />
    <Tower position={[44, 0, 62]} size={[18, 26, 14]} kind="white" night={night} />
  </group>
);
