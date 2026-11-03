import type { ReactNode } from "react";
import { AvalancheLogo } from "../three/avalanche";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import * as THREE from "three";
import { useLocal } from "../lib/motion";
import { T } from "../lib/theme";
import {
  cheer,
  listening,
  Person,
  reachUp,
  SIT,
  STAND,
  talking,
  typing,
  wave,
  type Look,
  type Pose,
} from "../three/person";
import { ProjectedUI, screenCorners } from "../three/projector";
import { Bubble, Burst, Monitor, Room } from "../three/props";
import { Cam, Scene3D, seg, type CamKey, type V3 } from "../three/stage";
import { HeroMan, TOWN } from "./cast";
import { ConsoleHome } from "./console-ui";
import { IdeaWeb } from "./IdeaWeb";
import { local } from "../three/hue-life";
import { AcceptAndPay, ChatQuote, StudioPublish } from "./ui-scenes";
import { OFFICE, PLAZA, UP, upKeys, World } from "./world";

// The real Payvoke UI, on real screens: his laptop, Grandma's laptop in her
// kitchen, a busy man's monitor in an office over the square, and a giant
// billboard on the riverside square. Each scene cuts between the screen and the person's face.

const cut = (at: number, from: Omit<CamKey, "t">, to: Omit<CamKey, "t">, len: number): CamKey[] => [
  { ...from, t: at },
  { ...to, t: at + len - 0.002 },
];

/** The laptop screen's corners, for a laptop placed at `base` (Monitor's position). */
const laptopScreen = (base: V3): V3[] => {
  const a = -0.22;
  const c: V3 = [
    base[0],
    base[1] + 0.025 + 0.235 * Math.cos(a),
    base[2] - 0.22 + 0.235 * Math.sin(a),
  ];
  return screenCorners(c, 0.7, 0.42, 0, a);
};

/** UI that runs on its own clock inside a screen. */
const OnClock = ({
  from = 0,
  dur,
  children,
}: {
  from?: number;
  dur: number;
  children: ReactNode;
}) => {
  const { fps } = useVideoConfig();
  return (
    <Sequence
      from={Math.round(from * fps)}
      durationInFrames={Math.max(1, Math.round(dur * fps))}
      layout="none"
    >
      <AbsoluteFill style={{ background: T.bgDeep }}>{children}</AbsoluteFill>
    </Sequence>
  );
};

/* ---------------- his desk ---------------- */

/**
 * At his laptop: the screen first (Studio or the wallet), then his face.
 * `screenFor` is how long the screen shot lasts.
 */
export const HeroDesk = ({ ui, screenFor }: { ui: "studio" | "wallet"; screenFor: number }) => {
  const { t, dur } = useLocal();
  const keys = upKeys([
    ...cut(
      0,
      { pos: [-0.62, 1.3, -1.5], look: [0, 1.0, -2.27], fov: 40 },
      { pos: [-0.48, 1.22, -1.68], look: [0, 1.0, -2.27], fov: 38 },
      screenFor,
    ),
    ...(ui === "studio"
      ? cut(
          screenFor,
          { pos: [0.3, 1.5, -2.36], look: [0, 1.35, -1.4], fov: 44 },
          { pos: [0.15, 1.48, -2.33], look: [0, 1.35, -1.4], fov: 42 },
          dur - screenFor,
        )
      : cut(
          screenFor,
          { pos: [1.7, 1.7, -0.3], look: [0, 1.15, -1.5], fov: 46 },
          { pos: [1.5, 1.65, -0.5], look: [0, 1.15, -1.5], fov: 44 },
          dur - screenFor,
        )),
  ]);
  const reacting = t >= screenFor;
  const spin = ui === "wallet" && reacting ? seg(t, screenFor, dur) * Math.PI * 2 : 0;
  const pose: Pose = reacting ? cheer(t, SIT) : typing(t, 1.6);
  return (
    <AbsoluteFill>
      <Scene3D env={0.5}>
        <Cam keys={keys} t={t} />
        <World t={t} time={0.95} lit={() => false} people={false} plaza={false} />
        <group position={[0, UP, 0]}>
          <Room
            t={t}
            screen={{ kind: "console", page: ui === "studio" ? "studio" : "home" }}
            screenKey={`hero-${ui}`}
            mugs={5}
            clock={[23, 12]}
          />
          <HeroMan
            pose={pose}
            rotation={Math.PI + spin}
            face={reacting ? "laugh" : "smile"}
            t={t}
            gaze={reacting ? [0, 0.3] : [0, -0.5]}
          />
        </group>
      </Scene3D>
      {!reacting && (
        <ProjectedUI
          keys={keys}
          t={t}
          corners={laptopScreen([0, 0.755 + UP, -2.0])}
          uiW={1800}
          uiH={1080}
        >
          <OnClock dur={screenFor}>{ui === "studio" ? <StudioPublish /> : <ConsoleHome />}</OnClock>
        </ProjectedUI>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- grandma's kitchen ---------------- */

const GRANDMA: Look = {
  shirt: "#e88aa8",
  pants: "#5a4a6a",
  hair: "#e6e6e6",
  hairStyle: "bun",
  skin: "#f5d3b5",
  glasses: true,
};

/** A tiny tabby cat, walking. */
const Cat = ({ position, rotation, t }: { position: V3; rotation: number; t: number }) => (
  <group position={position} rotation={[0, rotation, 0]} scale={0.8}>
    <mesh position={[0, 0.16, 0]} scale={[0.7, 0.6, 1.2]}>
      <sphereGeometry args={[0.16, 14, 10]} />
      <meshStandardMaterial color="#f2a541" />
    </mesh>
    <mesh position={[0, 0.3, 0.2]}>
      <sphereGeometry args={[0.12, 14, 10]} />
      <meshStandardMaterial color="#f2a541" />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 0.06, 0.42, 0.2]}>
        <coneGeometry args={[0.04, 0.08, 6]} />
        <meshStandardMaterial color="#f2a541" />
      </mesh>
    ))}
    {[-1, 1].map((s) => (
      <mesh key={`e${s}`} position={[s * 0.045, 0.32, 0.31]}>
        <sphereGeometry args={[0.018, 8, 6]} />
        <meshBasicMaterial color="#111" />
      </mesh>
    ))}
    <mesh
      position={[0, 0.3, -0.25]}
      rotation={[0.9 + Math.sin(t * 6) * 0.3, 0, Math.sin(t * 4) * 0.4]}
    >
      <cylinderGeometry args={[0.025, 0.02, 0.35, 6]} />
      <meshStandardMaterial color="#f2a541" />
    </mesh>
  </group>
);

/** Her kitchen, floating somewhere quiet: tiles, cabinets, a fridge, tea. */
const Kitchen = ({ t }: { t: number }) => {
  const floor = new THREE.Color("#e9e2d0");
  return (
    <group>
      <ambientLight intensity={0.9} color="#fff4e0" />
      <pointLight position={[0, 2.6, 0.5]} intensity={18} distance={10} decay={1} color="#ffe0b0" />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color={floor} />
      </mesh>
      {Array.from({ length: 64 }, (_, i) =>
        (i + Math.floor(i / 8)) % 2 ? (
          <mesh
            key={i}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[-3.5 + (i % 8), 0.004, -3.5 + Math.floor(i / 8)]}
          >
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial color="#5fa8c9" />
          </mesh>
        ) : null,
      )}
      {[
        [0, 1.5, -2.5, 8, 3, 0.1],
        [-3, 1.5, 0, 0.1, 3, 6],
      ].map(([x, y, z, w, h, d], i) => (
        <mesh key={i} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial color="#fde4b8" />
        </mesh>
      ))}
      {/* a window with a sunny garden painted behind */}
      <mesh position={[1.6, 1.8, -2.44]}>
        <planeGeometry args={[1.6, 1.1]} />
        <meshBasicMaterial color="#9fd8ff" />
      </mesh>
      <mesh position={[1.6, 1.45, -2.43]}>
        <planeGeometry args={[1.6, 0.4]} />
        <meshBasicMaterial color="#7cc46a" />
      </mesh>
      {/* cabinets and a fridge */}
      {[-2.2, -1.4, -0.6].map((x) => (
        <mesh key={x} position={[x, 0.45, -2.15]}>
          <boxGeometry args={[0.76, 0.9, 0.6]} />
          <meshStandardMaterial color="#a8dadc" />
        </mesh>
      ))}
      <mesh position={[-1.4, 0.92, -2.15]}>
        <boxGeometry args={[2.4, 0.05, 0.64]} />
        <meshStandardMaterial color="#f3efe0" />
      </mesh>
      <mesh position={[-2.55, 1.0, -0.8]}>
        <boxGeometry args={[0.7, 2, 0.7]} />
        <meshStandardMaterial color="#ffffff" metalness={0.2} roughness={0.3} />
      </mesh>
      {/* table, tea, cookies */}
      <mesh position={[0, 0.73, -0.3]}>
        <boxGeometry args={[1.6, 0.05, 1.1]} />
        <meshStandardMaterial color="#c97b4a" />
      </mesh>
      {[-0.7, 0.7].map((x) =>
        [-0.75, 0.15].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 0.36, z]}>
            <boxGeometry args={[0.06, 0.72, 0.06]} />
            <meshStandardMaterial color="#9c5b3a" />
          </mesh>
        )),
      )}
      <mesh position={[0.55, 0.84, -0.5]}>
        <sphereGeometry args={[0.12, 14, 10]} />
        <meshStandardMaterial color="#ef476f" />
      </mesh>
      <mesh position={[-0.55, 0.77, -0.15]}>
        <cylinderGeometry args={[0.14, 0.14, 0.02, 20]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.6 + i * 0.06, 0.79, -0.15 + (i % 2) * 0.05]}>
          <cylinderGeometry args={[0.04, 0.04, 0.015, 12]} />
          <meshStandardMaterial color="#c08850" />
        </mesh>
      ))}
      <mesh position={[0, 0.45, 0.35]}>
        <boxGeometry args={[0.5, 0.06, 0.45]} />
        <meshStandardMaterial color="#7a4a32" />
      </mesh>
      <Cat position={[0.65 - seg(t, 0, 5) * 1.0, 0.755, -0.75]} rotation={-Math.PI / 2} t={t} />
    </group>
  );
};

export const GrandmaKitchen = ({
  quoteAt,
  wideFor,
  screenFor,
}: {
  quoteAt: number;
  wideFor: number;
  screenFor: number;
}) => {
  const { t, dur } = useLocal();
  const laptop: V3 = [0, 0.755, -0.25];
  const keys: CamKey[] = [
    ...cut(
      0,
      { pos: [3.4, 2.2, -2.0], look: [0, 1.45, 0.3], fov: 50 },
      { pos: [3.1, 2.15, -1.8], look: [0, 1.45, 0.3], fov: 48 },
      wideFor,
    ),
    ...cut(
      wideFor,
      { pos: [-0.5, 1.28, 0.25], look: [0, 1.0, -0.52], fov: 40 },
      { pos: [-0.38, 1.22, 0.1], look: [0, 1.0, -0.52], fov: 38 },
      screenFor,
    ),
    ...cut(
      wideFor + screenFor,
      { pos: [0.1, 1.42, -0.95], look: [0, 1.35, 0.3], fov: 42 },
      { pos: [0.05, 1.4, -0.85], look: [0, 1.35, 0.3], fov: 40 },
      dur - wideFor - screenFor,
    ),
  ];
  const surprised = t >= wideFor + screenFor;
  // One finger, very slowly.
  const pose: Pose = surprised
    ? {
        ...SIT,
        lean: -0.25,
        headX: -0.15,
        lSh: [-0.6, 0.9],
        rSh: [-0.6, 0.9],
        lEl: -1.6,
        rEl: -1.6,
      }
    : {
        ...SIT,
        lean: 0.3,
        headX: 0.25,
        lSh: [-0.4, 0.2],
        rSh: [-0.75 + Math.max(0, Math.sin(t * 5)) * 0.15, 0.1],
        lEl: -0.6,
        rEl: -1.0,
      };
  const showScreen = t >= wideFor && t < wideFor + screenFor;
  return (
    <AbsoluteFill>
      <Scene3D background="#fde4b8" env={0.7}>
        <Cam keys={keys} t={t} />
        <Kitchen t={t} />
        <Monitor
          screen={{ kind: "console", page: "chat" }}
          screenKey="grandma-chat"
          position={laptop}
        />
        <Person
          pose={pose}
          position={[0, 0, 0.3]}
          rotation={Math.PI}
          look={GRANDMA}
          name={t < wideFor ? "Bà Diễm Xoan" : undefined}
          face={surprised ? (t > dur - 0.4 ? "grin" : "o") : "flat"}
          t={t}
          gaze={surprised ? [0, 0.2] : [0, -0.6]}
        />
      </Scene3D>
      {showScreen && (
        <ProjectedUI keys={keys} t={t} corners={laptopScreen(laptop)} uiW={1800} uiH={1080}>
          <OnClock dur={dur}>
            <ChatQuote quoteAt={quoteAt} />
          </OnClock>
        </ProjectedUI>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- the busy office ---------------- */

const SUIT: Look = {
  shirt: "#22324a",
  pants: "#1b2533",
  hair: "#2b1d14",
  hairStyle: "short",
  skin: "#e0a77f",
  shoes: "#3a2a1a",
};

/** He says yes without looking: phone at his ear, hand already on the mouse. */
export const BusyOffice = ({ screenFor }: { screenFor: number }) => {
  const { t, dur } = useLocal();
  const o = (p: V3): V3 => [p[0] + OFFICE[0], p[1] + OFFICE[1], p[2] + OFFICE[2]];
  const screenC = o([0, 1.18, -0.62]);
  const keys: CamKey[] = [
    ...cut(
      0,
      { pos: o([0.55, 1.45, 0.25]), look: screenC, fov: 40 },
      { pos: o([0.45, 1.38, 0.1]), look: screenC, fov: 38 },
      screenFor,
    ),
    ...cut(
      screenFor,
      { pos: o([-1.3, 1.55, -1.3]), look: o([0.1, 1.25, 0.1]), fov: 44 },
      { pos: o([-1.15, 1.5, -1.15]), look: o([0.1, 1.25, 0.1]), fov: 42 },
      dur - screenFor,
    ),
  ];
  const spilled = seg(t, screenFor + 0.15, screenFor + 0.45);
  const pose: Pose = {
    ...talking(t, SIT, 3),
    headY: 0.7,
    lSh: [-1.2, 1.1],
    lEl: -2.4,
    rSh: [-0.75 + (t > screenFor ? Math.max(0, 1 - (t - screenFor) * 4) * -0.2 : 0), 0.2],
    rEl: -0.6,
  };
  return (
    <AbsoluteFill>
      <Scene3D env={0.6}>
        <Cam keys={keys} t={t} />
        <World t={t} time={0.3} traffic={false} people={false} />
        <group position={OFFICE}>
          <ambientLight intensity={0.8} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.8]}>
            <planeGeometry args={[8, 6]} />
            <meshStandardMaterial color="#3a3f4a" />
          </mesh>
          {/* the office's own walls inside the yellow building */}
          <mesh position={[0, 1.65, 3.8]}>
            <boxGeometry args={[8, 3.3, 0.1]} />
            <meshStandardMaterial color="#e9e4d8" />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 4, 1.65, 0.8]}>
              <boxGeometry args={[0.1, 3.3, 6]} />
              <meshStandardMaterial color="#dfe7e2" />
            </mesh>
          ))}
          <mesh position={[0, 3.3, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[8, 6]} />
            <meshStandardMaterial color="#f3efe6" />
          </mesh>
          {/* a whiteboard full of arrows and a happy plant */}
          <mesh position={[-1.2, 1.7, 3.74]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[2.2, 1.2]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[-1.7 + i * 0.5, 1.75 + (i % 2) * 0.2, 3.72]}>
              <boxGeometry args={[0.35, 0.05, 0.01]} />
              <meshBasicMaterial color={["#e63946", "#1d6fa3", "#2a9d8f"][i]} />
            </mesh>
          ))}
          <mesh position={[2.8, 0.5, 3.2]}>
            <cylinderGeometry args={[0.25, 0.2, 0.5, 12]} />
            <meshStandardMaterial color="#b5523b" />
          </mesh>
          <mesh position={[2.8, 1.2, 3.2]}>
            <sphereGeometry args={[0.55, 12, 10]} />
            <meshStandardMaterial color="#3f8f4f" />
          </mesh>
          {/* glass wall to the skyline */}
          <mesh position={[0, 1.6, -2.2]}>
            <planeGeometry args={[8, 3.2]} />
            <meshStandardMaterial color="#cfe6ff" transparent opacity={0.08} />
          </mesh>
          <mesh position={[0, 0.74, -0.45]}>
            <boxGeometry args={[1.8, 0.05, 0.9]} />
            <meshStandardMaterial color="#e9e4d8" />
          </mesh>
          <mesh position={[0, 0.37, -0.45]}>
            <boxGeometry args={[1.7, 0.7, 0.05]} />
            <meshStandardMaterial color="#c9c2b0" />
          </mesh>
          {/* the monitor */}
          <mesh position={[0, 0.88, -0.66]}>
            <boxGeometry args={[0.08, 0.28, 0.06]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, 1.18, -0.66]}>
            <boxGeometry args={[0.96, 0.58, 0.05]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          <mesh position={[0, 1.18, -0.634]}>
            <planeGeometry args={[0.9, 0.52]} />
            <meshBasicMaterial color={T.bgDeep} />
          </mesh>
          <pointLight
            position={[0, 1.2, -0.2]}
            intensity={4}
            distance={3}
            decay={1}
            color="#a9d8ff"
          />
          {/* coffee, about to go */}
          <group position={[0.6, 0.765, -0.3]} rotation={[0, 0, -spilled * 1.5]}>
            <mesh position={[0, 0.07, 0]}>
              <cylinderGeometry args={[0.05, 0.045, 0.14, 14]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
          {spilled > 0 && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0.85, 0.77, -0.3]}
              scale={[spilled, spilled, 1]}
            >
              <circleGeometry args={[0.25, 20]} />
              <meshStandardMaterial color="#5a3a22" />
            </mesh>
          )}
          <Burst
            position={[0.62, 0.85, -0.3]}
            age={t - screenFor - 0.15}
            count={18}
            speed={1.5}
            size={0.03}
            colors={["#5a3a22", "#7a4a2a"]}
            life={0.8}
          />
          <Person
            pose={pose}
            position={[0, 0, 0.15]}
            rotation={Math.PI}
            look={SUIT}
            name={t >= screenFor ? "Huỳnh Văn Sinh" : undefined}
            face="talk"
            t={t}
            gaze={[0.8, 0]}
            inHands={undefined}
          />
          <Bubble
            position={[-0.7, 2.25, 0.0]}
            rotation={Math.PI + 0.25}
            lines={["Yes, yes, buy it!"]}
            w={1.9}
            h={0.7}
            scale={seg(t, screenFor, screenFor + 0.2)}
          />
        </group>
      </Scene3D>
      {t < screenFor && (
        <ProjectedUI
          keys={keys}
          t={t}
          corners={screenCorners(screenC, 0.9, 0.52)}
          uiW={1880}
          uiH={1080}
        >
          <OnClock dur={dur}>
            <AcceptAndPay />
          </OnClock>
        </ProjectedUI>
      )}
    </AbsoluteFill>
  );
};

/* ---------------- the plaza billboard ---------------- */

const CROWD_NAMES = [
  "Võ Văn Duy",
  "Phạm Quốc Đạt",
  "Phát Lê",
  "Tuấn Kiệt",
  "Đình Thương",
  "Hồ Đình Dụng",
  "Nhật Tân",
  "Ngọc Như",
  "Trường Minh",
  "Tiến Bảo",
  "Trần Duy Anh",
  "Nam Khánh",
  "Minh Đức",
  "Quốc Đống",
  "Huyền Trang",
  "Gia Hưng",
];

/** The store on a giant billboard; the crowd looks up and cheers. */
export const PlazaBillboard = () => {
  const { t, dur } = useLocal();
  const board: V3 = [PLAZA[0], 12, PLAZA[2] - 14];
  const wide = dur * 0.68;
  const keys: CamKey[] = [
    // behind the crowd: every friend's name under the big screen, slowly
    ...cut(
      0,
      { pos: [-5, 2.3, PLAZA[2] + 13], look: [-1.5, 6.6, board[2]], fov: 58 },
      { pos: [5, 2.3, PLAZA[2] + 13], look: [1.5, 6.6, board[2]], fov: 58 },
      wide,
    ),
    ...cut(
      wide,
      { pos: [0, 9, PLAZA[2] + 2], look: board, fov: 50 },
      { pos: [0, 9.5, PLAZA[2]], look: board, fov: 48 },
      dur - wide,
    ),
  ];
  const cheerAt = 2.2;
  const crowd: { x: number; z: number; look: Look; name: string }[] = CROWD_NAMES.map(
    (name, i) => ({
      x: -7 + (i % 8) * 2 + (i >= 8 ? 1 : 0),
      z: PLAZA[2] + 5.5 + (i >= 8 ? 1.6 : 0),
      look: local(i * 7 + 3, "none"),
      name,
    }),
  );
  return (
    <AbsoluteFill>
      <Scene3D env={0.4}>
        <Cam keys={keys} t={t} />
        <World t={t + 170} time={0.85} river={false} plaza={false} />
        {/* the billboard on its frame */}
        <group position={board}>
          <mesh>
            <boxGeometry args={[17, 9.8, 0.4]} />
            <meshStandardMaterial color="#111" />
          </mesh>
          {[-6, 6].map((x) => (
            <mesh key={x} position={[x, -8, -0.5]}>
              <boxGeometry args={[0.6, 8, 0.6]} />
              <meshStandardMaterial color="#555b66" metalness={0.7} />
            </mesh>
          ))}
          <pointLight position={[0, 0, 4]} intensity={60} distance={30} decay={1} color="#a9d8ff" />
          <AvalancheLogo
            position={[7.2, 6.4, 0.3]}
            scale={1.3}
            spin={Math.sin(t * 2) * 0.3}
            glow={1.2}
          />
        </group>
        {crowd.map((c, i) => {
          const pose: Pose =
            t < cheerAt
              ? i % 3 === 0
                ? reachUp(STAND)
                : { ...STAND, headX: -0.55 }
              : i % 2
                ? cheer(t + i)
                : wave(t + i, STAND);
          return (
            <Person
              key={i}
              pose={{ ...pose, headX: Math.min(pose.headX, -0.4) }}
              position={[c.x, 0.16, c.z]}
              rotation={Math.PI + (i - 4) * 0.05}
              look={c.look}
              name={t < wide ? c.name : undefined}
              tagLift={(i % 2) * 0.3}
              face={t < cheerAt ? "o" : "laugh"}
              t={t + i}
              gaze={[0, 1]}
            />
          );
        })}
        <Person
          pose={t < cheerAt ? listening(t) : cheer(t)}
          position={[5.5, 0.16, PLAZA[2] + 7]}
          rotation={Math.PI + 0.3}
          look={TOWN[0]}
          name="Trần Khiêm Hiếu"
          face="grin"
          t={t}
        />
      </Scene3D>
      <ProjectedUI
        keys={keys}
        t={t}
        corners={screenCorners(board.map((v, i) => (i === 2 ? v + 0.21 : v)) as V3, 16.4, 9.2)}
        uiW={1920}
        uiH={1080}
      >
        <OnClock dur={dur}>
          <IdeaWeb />
        </OnClock>
      </ProjectedUI>
    </AbsoluteFill>
  );
};
