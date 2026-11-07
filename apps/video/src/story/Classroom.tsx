import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { useLocal } from "../lib/motion";
import { T } from "../lib/theme";
import { drawShopSign } from "../three/hue";
import {
  cheer,
  holding,
  listening,
  Person,
  reachUp,
  SIT,
  STAND,
  talking,
  type Look,
  type Pose,
} from "../three/person";
import { ProjectedUI, screenCorners } from "../three/projector";
import { IdeaCube } from "../three/props";
import { arc, Cam, Scene3D, seg, useCanvasTexture, type CamKey, type V3 } from "../three/stage";
import { HeroMan } from "./cast";
import { ConsoleHome } from "./console-ui";

// Pre-chorus 2, "A little work, a little time / Your idea might help with
// mine": a class at Trường Đại học Khoa học, in three parts. Chiến shows
// his console on the projector (Jingle Bot's earnings climbing); he tosses
// a little idea to every desk; the students swap theirs across the aisle
// while the lecturers sitting in at the back cheer.

const LECTURER: Look = {
  skin: "#f2c9a0",
  shirt: "#c3b1e1",
  pants: "#2b3445",
  hair: "#111",
  hairStyle: "bun",
  glasses: true,
};
const OBSERVERS: [string, Look][] = [
  [
    "Thầy Nguyễn Văn Trung",
    { skin: "#e0a77f", shirt: "#ffffff", pants: "#2b3445", hair: "#222", glasses: true },
  ],
  ["Thầy Lê Hữu Bình", { skin: "#f2c9a0", shirt: "#9fb4c8", pants: "#3a4250", hair: "#2b1d14" }],
  [
    "Thầy Trần Thanh Lương",
    { skin: "#d9a07a", shirt: "#3f7d63", pants: "#2b3445", hair: "#111", glasses: true },
  ],
  ["Thầy Ngô Nhân Đức", { skin: "#f5d3b5", shirt: "#e5bd83", pants: "#33404d", hair: "#3b2a1f" }],
];
const STUDENTS: [string, Look][] = [
  [
    "Nhật Đoàn",
    { skin: "#e0a77f", shirt: "#3a86ff", pants: "#1d3557", hair: "#111", hairStyle: "spiky" },
  ],
  [
    "Thành Nhân Premium",
    { skin: "#f2c9a0", shirt: "#ffd166", pants: "#2b3445", hair: "#111", glasses: true },
  ],
  [
    "Mỹy Hạnh",
    { skin: "#f5d3b5", shirt: "#ff7aa2", pants: "#2b3445", hair: "#111", hairStyle: "long" },
  ],
  ["Trí Nhân Tôn", { skin: "#c68a5e", shirt: "#06d6a0", pants: "#3a4250", hair: "#111" }],
  [
    "Uyển Nhi",
    { skin: "#f5d3b5", shirt: "#ffffff", pants: "#1d3557", hair: "#111", hairStyle: "ponytail" },
  ],
  [
    "Toàn Lê",
    { skin: "#d9a07a", shirt: "#8f6bd1", pants: "#2b3445", hair: "#2b1d14", glasses: true },
  ],
  [
    "Tuấn Phong",
    { skin: "#e0a77f", shirt: "#e63946", pants: "#1b2533", hair: "#111", hairStyle: "spiky" },
  ],
  [
    "Nguyễn Văn Hải",
    {
      skin: "#e0a77f",
      shirt: "#8f6bd1",
      pants: "#2b3445",
      hair: "#2b1d14",
      hairStyle: "spiky",
      glasses: true,
    },
  ],
];

const ROWS = [-1.4, 0.7];
const DESKS = [-2.3, 2.3];
/** Seat i: row, desk, and left/right on the desk. */
const seat = (i: number): V3 => {
  const row = Math.floor(i / 4);
  const desk = Math.floor((i % 4) / 2);
  const side = i % 2 ? 0.62 : -0.62;
  return [DESKS[desk] + side, 0, ROWS[row] + 0.55];
};
const SCREEN: V3 = [2.6, 2.05, -4.93];
const CHIEN: V3 = [-0.4, 0, -3.6];

const Banner = () => {
  const map = useCanvasTexture(1536, 128, "class-banner", (ctx, w, h) =>
    drawShopSign(
      ctx,
      w,
      h,
      ["KHOA CÔNG NGHỆ THÔNG TIN", "Trường Đại học Khoa học · Đại học Huế"],
      ["#1d3b5c", "#ffffff"],
    ),
  );
  return (
    <mesh position={[-2.6, 3.15, -4.94]}>
      <planeGeometry args={[5.4, 0.45]} />
      <meshStandardMaterial
        map={map}
        emissiveMap={map}
        emissive="#ffffff"
        emissiveIntensity={0.3}
      />
    </mesh>
  );
};

const Board = () => {
  const map = useCanvasTexture(512, 256, "class-board", (ctx, w, h) => {
    ctx.fillStyle = "#f7f7f2";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#1d4e89";
    ctx.lineWidth = 4;
    ctx.font = "600 30px sans-serif";
    ctx.fillStyle = "#1d4e89";
    ctx.fillText("Pay per job (x402)", 24, 50);
    ctx.fillStyle = "#c1121f";
    ctx.fillText("offer → accept → held", 24, 110);
    ctx.fillText("→ delivered → paid ✓", 24, 160);
    ctx.beginPath();
    ctx.arc(420, 190, 40, 0, Math.PI * 2);
    ctx.stroke();
  });
  return (
    <mesh position={[-2.6, 2.0, -4.94]}>
      <planeGeometry args={[3.6, 1.8]} />
      <meshStandardMaterial map={map} />
    </mesh>
  );
};

const Desk = ({ position }: { position: V3 }) => (
  <group position={position}>
    <mesh position={[0, 0.74, 0]}>
      <boxGeometry args={[2.3, 0.05, 0.6]} />
      <meshStandardMaterial color="#c08850" />
    </mesh>
    {[-1.05, 1.05].map((x) => (
      <mesh key={x} position={[x, 0.37, 0]}>
        <boxGeometry args={[0.06, 0.74, 0.55]} />
        <meshStandardMaterial color="#6b4a33" />
      </mesh>
    ))}
    <mesh position={[0, 0.45, 1.0]}>
      <boxGeometry args={[2.3, 0.06, 0.4]} />
      <meshStandardMaterial color="#8a6040" />
    </mesh>
    {[-0.62, 0.62].map((x) => (
      <group key={x} position={[x, 0.78, 0.05]}>
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.42, 0.02, 0.28]} />
          <meshStandardMaterial color="#9aa3a8" metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.14, -0.14]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.42, 0.27, 0.015]} />
          <meshStandardMaterial color="#1d2a33" emissive={T.brand} emissiveIntensity={0.2} />
        </mesh>
      </group>
    ))}
  </group>
);

const Room = () => (
  <group>
    <ambientLight intensity={0.9} color="#fff6e8" />
    <directionalLight position={[-6, 6, 2]} intensity={1.6} color="#fff1d6" />
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 10]} />
      <meshStandardMaterial color="#d8c8a8" />
    </mesh>
    {/* walls: front with board and screen, the window side, the back */}
    <mesh position={[0, 1.8, -5]}>
      <boxGeometry args={[12, 3.6, 0.1]} />
      <meshStandardMaterial color="#f3eee2" />
    </mesh>
    <mesh position={[0, 1.8, 5]}>
      <boxGeometry args={[12, 3.6, 0.1]} />
      <meshStandardMaterial color="#f3eee2" />
    </mesh>
    <mesh position={[6, 1.8, 0]}>
      <boxGeometry args={[0.1, 3.6, 10]} />
      <meshStandardMaterial color="#e9e2d0" />
    </mesh>
    <mesh position={[-6, 1.8, 0]}>
      <boxGeometry args={[0.1, 3.6, 10]} />
      <meshStandardMaterial color="#e9e2d0" />
    </mesh>
    {[-3, 0, 3].map((z) => (
      <group key={z} position={[-5.93, 2.0, z]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.8, 1.5]} />
          <meshBasicMaterial color="#cfe9ff" toneMapped={false} />
        </mesh>
        <mesh position={[0.02, -0.2, 0]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[1.8, 0.6]} />
          <meshBasicMaterial color="#7cc46a" toneMapped={false} />
        </mesh>
      </group>
    ))}
    <mesh position={[0, 3.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
      <planeGeometry args={[12, 10]} />
      <meshStandardMaterial color="#fbf8f0" />
    </mesh>
    {/* teacher's desk and the projector screen */}
    <mesh position={[-2.6, 0.4, -4.0]}>
      <boxGeometry args={[1.8, 0.8, 0.7]} />
      <meshStandardMaterial color="#8a6040" />
    </mesh>
    <mesh position={[SCREEN[0], SCREEN[1], SCREEN[2] - 0.02]}>
      <boxGeometry args={[4.1, 2.35, 0.03]} />
      <meshStandardMaterial color="#20262a" />
    </mesh>
    <Board />
    <Banner />
    {ROWS.map((z) => DESKS.map((x) => <Desk key={`${x}${z}`} position={[x, 0, z]} />))}
  </group>
);

export const Classroom = ({ beat, lectureFor }: { beat: number; lectureFor: number }) => {
  const { t, dur } = useLocal();
  const tossAt = lectureFor;
  const passAt = lectureFor + 3;
  const { fps } = useVideoConfig();
  const keys: CamKey[] = [
    // 1. the lecture: Chiến shows his console, the charts climbing
    { t: 0, pos: [3.8, 2.4, 3.6], look: [0.2, 2.0, -4.4], fov: 56 },
    { t: tossAt - 0.001, pos: [3.0, 2.3, 2.0], look: [0.2, 2.0, -4.4], fov: 54 },
    // 2. from the front, a slow pan across the students
    { t: tossAt, pos: [-2.2, 2.3, -4.4], look: [-1.6, 1.1, 0.8], fov: 52 },
    { t: passAt - 0.001, pos: [2.2, 2.3, -4.4], look: [1.6, 1.1, 0.8], fov: 52 },
    // 3. the lecturers sitting in at the back
    { t: passAt, pos: [0.4, 2.1, -0.9], look: [-1.9, 1.5, 3.4], fov: 54 },
    { t: dur, pos: [0.8, 2.1, -0.7], look: [-1.7, 1.5, 3.4], fov: 52 },
  ];
  const hand: V3 = [CHIEN[0] + 0.3, 1.1, CHIEN[2] + 0.35];
  const tossK = (i: number) => seg(t, tossAt + i * 0.12, tossAt + 0.6 + i * 0.12);
  const got = (i: number) => t >= tossAt + 0.6 + i * 0.12;
  const deskTop = (i: number): V3 => {
    const s = seat(i);
    return [s[0], 1.02, s[2] - 0.45];
  };
  // After the toss, neighbours across the aisle swap ideas on the beat.
  const swaps = Array.from(
    { length: Math.floor((dur - passAt) / beat) + 1 },
    (_, k) => passAt + k * beat,
  );
  const studentPose = (i: number): Pose => {
    if (t < tossAt) return { ...listening(t + i), ...SIT, headX: -0.1, headY: 0.15 };
    if (t < passAt) return got(i) ? { ...cheer(t + i * 0.2, SIT) } : reachUp(SIT);
    return i % 3 ? holding(SIT) : talking(t + i, SIT, i);
  };
  return (
    <AbsoluteFill>
      <Scene3D background="#f3eee2" env={0.6}>
        <Cam keys={keys} t={t} />
        <Room />
        <Person
          pose={t < tossAt ? talking(t, STAND, 1) : cheer(t)}
          position={[-2.6, 0, -3.3]}
          rotation={0.2}
          look={LECTURER}
          face={t < tossAt ? "talk" : "laugh"}
          t={t}
        />
        <HeroMan
          position={CHIEN}
          rotation={0}
          pose={
            t < tossAt - 0.3
              ? { ...reachUp(STAND), rSh: [-1.7, 0.6] }
              : t < tossAt + 1.2
                ? reachUp(STAND)
                : cheer(t)
          }
          face="grin"
          t={t}
          name="Võ Quang Chiến"
        />
        {STUDENTS.map(([name, look], i) => (
          <Person
            key={name}
            pose={studentPose(i)}
            position={seat(i)}
            rotation={Math.PI}
            look={look}
            face={t < tossAt ? "smile" : got(i) ? "laugh" : "o"}
            t={t + i}
            name={t >= tossAt && t < passAt ? name : undefined}
            tagLift={(i % 2) * 0.28}
            tagRange={7.5}
            gaze={t < tossAt ? [0.3, 0.3] : [0, 0]}
          />
        ))}
        {OBSERVERS.map(([name, look], i) => (
          <Person
            key={name}
            pose={
              t > passAt
                ? cheer(t + i)
                : { ...STAND, lSh: [0.3, 0.1], rSh: [0.3, 0.1], lEl: -1.4, rEl: -1.4 }
            }
            position={[-4.4 + i * 1.6, 0, 3.4]}
            rotation={Math.PI}
            look={look}
            face={t > passAt ? "laugh" : "smile"}
            t={t + i}
            tagLift={(i % 2) * 0.28}
          />
        ))}
        {/* one idea for every desk */}
        {STUDENTS.map((_, i) => {
          if (t < tossAt) return null;
          const k = tossK(i);
          if (k <= 0) return null;
          if (k < 1)
            return (
              <IdeaCube key={i} position={arc(hand, deskTop(i), k, 1.6)} size={0.18} t={t + i} />
            );
          // then passed across the aisle and back, on the beat
          const swap = swaps.findLast((s) => t >= s);
          if (swap === undefined || t < passAt)
            return <IdeaCube key={i} position={deskTop(i)} size={0.16} t={t + i} light={false} />;
          const row = Math.floor(i / 4);
          const mate = row * 4 + (((i % 4) + 2) % 4);
          const n = swaps.indexOf(swap);
          const [a, b] = n % 2 ? [deskTop(mate), deskTop(i)] : [deskTop(i), deskTop(mate)];
          const sk = Math.min(1, (t - swap) / (beat * 0.8));
          return (
            <IdeaCube key={i} position={arc(a, b, sk, 0.9)} size={0.16} t={t + i} light={false} />
          );
        })}
      </Scene3D>
      {t < tossAt && (
        <ProjectedUI
          keys={keys}
          t={t}
          corners={screenCorners(SCREEN, 3.9, 2.2)}
          uiW={1800}
          uiH={1080}
        >
          <Sequence durationInFrames={Math.max(1, Math.round(lectureFor * fps))} layout="none">
            <AbsoluteFill style={{ background: T.bgDeep }}>
              <ConsoleHome />
            </AbsoluteFill>
          </Sequence>
        </ProjectedUI>
      )}
    </AbsoluteFill>
  );
};
