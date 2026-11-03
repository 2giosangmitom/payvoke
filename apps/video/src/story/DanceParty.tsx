import { useMemo } from "react";
import { AvalancheLogo } from "../three/avalanche";
import * as THREE from "three";
import { BEAT, beatGrid, beatPulse, spectrum } from "../lib/audio";
import { useLocal } from "../lib/motion";
import { sans, T } from "../lib/theme";
import { routine } from "../three/dance";
import { Person, STAND, type Look } from "../three/person";
import { Burst, Fireworks, IdeaCube, Robot } from "../three/props";
import { drawLogo } from "../three/screens";
import { Cam, rand, Scene3D, useCanvasTexture, type CamKey, type V3 } from "../three/stage";
import { HERO } from "./cast";
import { PLAZA, World } from "./world";

// The EDM drops become a dance party. Drop 1: a stage on the downtown
// plaza with a dance crew, the hero DJing, a LED wall drawing the song,
// light beams and a jumping crowd. Drop 2: the same crew dancing down his
// street with all the neighbours, under fireworks.
// Positions are in "venue" space: the crew faces +z, the crowd is at +z.

const CREW_NAMES = ["Tizun", "King", "E Len Tròn", "Nguyên Nguyên", "Gia Hưng", "Ngọc Vũ"];
const CREW: Look[] = [
  {
    shirt: "#ff3d7f",
    pants: "#1d1d2b",
    hair: "#1b1b1b",
    hairStyle: "ponytail",
    skin: "#e0a77f",
    shoes: "#ffffff",
  },
  {
    shirt: "#00c2ff",
    pants: "#1d1d2b",
    hair: "#f2c14e",
    hairStyle: "spiky",
    skin: "#f5d3b5",
    shoes: "#ffffff",
  },
  {
    shirt: "#ffd23f",
    pants: "#1d1d2b",
    hair: "#2b1d14",
    hairStyle: "afro",
    skin: "#8d5a3b",
    shoes: "#ffffff",
  },
  {
    shirt: "#7cff6b",
    pants: "#1d1d2b",
    hair: "#c0392b",
    hairStyle: "bun",
    skin: "#f2c9a0",
    shoes: "#ffffff",
  },
  {
    shirt: "#b46bff",
    pants: "#1d1d2b",
    hair: "#111",
    hairStyle: "short",
    skin: "#a8714d",
    hat: "cap",
    hatColor: "#ff3d7f",
    shoes: "#ffffff",
  },
  {
    shirt: "#ff8c42",
    pants: "#1d1d2b",
    hair: "#5a2e1a",
    hairStyle: "long",
    skin: "#d9a07a",
    shoes: "#ffffff",
  },
];

/** Six dancers, re-forming every sixteen beats. */
const FORMATIONS: V3[][] = [
  [-3.75, -2.25, -0.75, 0.75, 2.25, 3.75].map((x) => [x, 0, 2.5] as V3),
  [
    [0, 0, 3.5],
    [-1.5, 0, 2.5],
    [1.5, 0, 2.5],
    [-3, 0, 1.5],
    [3, 0, 1.5],
    [0, 0, 1.5],
  ],
  [-2.4, -0.8, 0.8, 2.4, -1.6, 1.6].map((x, i) => [x, 0, i < 4 ? 3.2 : 1.6] as V3),
  Array.from(
    { length: 6 },
    (_, i) =>
      [Math.cos((i / 6) * Math.PI * 2) * 2.6, 0, 2.4 + Math.sin((i / 6) * Math.PI * 2) * 1.2] as V3,
  ),
];

const LedWall = ({ now, frame, w, h }: { now: number; frame: number; w: number; h: number }) => {
  const { n } = beatGrid(now);
  const bands = spectrum(now);
  const tex = useCanvasTexture(1024, 448, `led-${frame}`, (ctx, cw, ch) => {
    const g = ctx.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, "#1a0638");
    g.addColorStop(1, "#04232a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cw, ch);
    const bw = cw / (bands.length * 2);
    [...bands.slice().reverse(), ...bands].forEach((v, i) => {
      ctx.fillStyle = ["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b"][i % 4];
      const bh = 30 + v * (ch - 60);
      ctx.fillRect(i * bw + 3, ch - bh, bw - 6, bh);
    });
    ctx.fillStyle = "#000000aa";
    ctx.fillRect(cw / 2 - 300, ch / 2 - 90, 600, 180);
    drawLogo(ctx, cw / 2 - 270, ch / 2 - 60, 120);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${n % 16 < 8 ? 92 : 80}px ${sans}`;
    ctx.fillText(n % 16 < 8 ? "payvoke." : "a little idea", cw / 2 - 130, ch / 2 + 32);
  });
  return (
    <mesh position={[0, h / 2 + 1.2, -2.2]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
};

/** A cone of stage light, swinging on the beat. */
const Beam = ({
  position,
  color,
  angle,
  tilt,
}: {
  position: V3;
  color: string;
  angle: number;
  tilt: number;
}) => (
  <group position={position} rotation={[tilt, 0, angle]}>
    <mesh position={[0, -7, 0]}>
      <coneGeometry args={[1.6, 14, 20, 1, true]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.16}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
    <mesh>
      <sphereGeometry args={[0.25, 10, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  </group>
);

/** A cheap fan for the crowd: body, head, two raised arms, sometimes a glow stick. */
const Fan = ({
  position,
  color,
  skin,
  jump,
  arms,
  stick,
}: {
  position: V3;
  color: string;
  skin: string;
  jump: number;
  arms: number;
  stick?: string;
}) => (
  <group position={[position[0], position[1] + jump * 0.3, position[2]]}>
    <mesh position={[0, 0.75, 0]}>
      <capsuleGeometry args={[0.22, 0.6, 4, 8]} />
      <meshStandardMaterial color={color} />
    </mesh>
    <mesh position={[0, 1.45, 0]}>
      <sphereGeometry args={[0.24, 12, 10]} />
      <meshStandardMaterial color={skin} />
    </mesh>
    {[-1, 1].map((s) => (
      <group key={s} position={[s * 0.25, 1.1, 0]} rotation={[0, 0, s * (0.3 + arms * 2.4)]}>
        <mesh position={[0, 0.3, 0]}>
          <capsuleGeometry args={[0.06, 0.45, 4, 6]} />
          <meshStandardMaterial color={skin} />
        </mesh>
        {stick && s > 0 && (
          <mesh position={[0, 0.65, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.4, 6]} />
            <meshBasicMaterial color={stick} toneMapped={false} />
          </mesh>
        )}
      </group>
    ))}
  </group>
);

export const DanceParty = ({ at, venue }: { at: number; venue: "plaza" | "street" }) => {
  const { t, dur, frame } = useLocal();
  const now = at + t;
  const plaza = venue === "plaza";
  const origin: V3 = plaza ? [PLAZA[0], 0, PLAZA[2] - 10] : [-12, 0, -8];
  const yaw = plaza ? 0 : Math.PI / 2;
  const stageH = plaza ? 1.2 : 0.3;
  // His street is 11 m between the shop fronts: a narrower stage there.
  const SW = plaza ? 12 : 9;
  const toWorld = (p: V3): V3 => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [origin[0] + p[0] * c + p[2] * s, origin[1] + p[1], origin[2] - p[0] * s + p[2] * c];
  };
  const { n, p, pose, move } = routine(now);
  const pulse = beatPulse(now, 0.3);
  const formation = FORMATIONS[Math.floor(n / 16) % FORMATIONS.length];
  const prev = FORMATIONS[(Math.floor(n / 16) + FORMATIONS.length - 1) % FORMATIONS.length];
  const moveK = Math.min(1, ((n % 16) + p) / 2); // two beats to walk to the new spots

  // Cuts every eight beats.
  const shots: [V3, V3, number][] = plaza
    ? [
        [[0, 7, 22], [0, 3, 0], 50],
        [[0, 2.4, 7.5], [0, 2.6, 2], 46],
        [[1.3, stageH + 1.9, 1.7], [0, stageH + 1.35, -0.8], 40],
        [[11, 3.4, 5], [0, 2.5, 2], 44],
        [[0, 26, 30], [0, 0, 4], 50],
        [[-2, 3.2, 14], [0, 3.2, 0], 56],
      ]
    : [
        [[0, 4.2, 16], [0, 1.8, 2], 50],
        [[0, 1.6, 7], [0, 1.4, 2], 44],
        [[-3.5, 4.5, 12], [0, 1.3, 2], 46],
        [[0, 18, 22], [0, 0, 6], 52],
      ];
  const keys: CamKey[] = [];
  const shotLen = BEAT * 8;
  for (let k = 0; k * shotLen < dur + shotLen; k++) {
    const [pos, look, fov] = shots[k % shots.length];
    const drift: V3 = [Math.sin(k) * 1.2, 0.3, -1.2];
    keys.push({ t: k * shotLen, pos: toWorld(pos), look: toWorld(look), fov });
    keys.push({
      t: (k + 1) * shotLen - 0.002,
      pos: toWorld([pos[0] + drift[0], pos[1] + drift[1], pos[2] + drift[2]]),
      look: toWorld(look),
      fov,
    });
  }

  const fans = useMemo(
    () =>
      Array.from({ length: plaza ? 70 : 34 }, (_, i) => ({
        p: [
          (rand(i) - 0.5) * (plaza ? 22 : 9),
          0,
          (plaza ? 8 : 9) + rand(i + 5) * (plaza ? 14 : 11),
        ] as V3,
        color: ["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b", "#b46bff", "#ff8c42", "#ffffff"][i % 7],
        skin: ["#f2c9a0", "#e0a77f", "#8d5a3b", "#f5d3b5", "#a8714d"][i % 5],
        phase: rand(i + 9) * 0.3,
        stick: i % 3 === 0 ? ["#7cff6b", "#ff3d7f", "#00c2ff"][i % 3] : undefined,
      })),
    [plaza],
  );
  const bursts = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        at: at + 4 + i * BEAT * 1.5,
        pos: toWorld([(rand(i) - 0.5) * 40, 22 + rand(i + 2) * 14, -20 - rand(i + 3) * 30]),
        color: ["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b", "#b46bff"][i % 5],
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [at, venue],
  );

  return (
    <Scene3D env={0.12}>
      <Cam keys={keys} t={t} shake={pulse * 0.03} />
      <World
        t={now}
        time={1}
        lit={(h, w) => rand(h + w * 3) > 0.3}
        traffic={plaza}
        people={plaza}
        plaza={false}
        river={!plaza}
      />
      <ambientLight intensity={0.3 + pulse * 0.4} color="#b46bff" />
      <group position={origin} rotation={[0, yaw, 0]}>
        {/* stage, truss, LED wall */}
        <mesh position={[0, stageH / 2, 1]}>
          <boxGeometry args={[SW, stageH, 6]} />
          <meshStandardMaterial color="#15151f" metalness={0.4} roughness={0.4} />
        </mesh>
        <mesh position={[0, stageH + 0.01, 1]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[SW - 0.4, 5.6]} />
          <meshStandardMaterial
            color="#20202e"
            emissive={["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b"][n % 4]}
            emissiveIntensity={0.12 + pulse * 0.3}
          />
        </mesh>
        {[-SW / 2 - 0.2, SW / 2 + 0.2].map((x) => (
          <mesh key={x} position={[x, 4, -1.8]}>
            <boxGeometry args={[0.4, 8, 0.4]} />
            <meshStandardMaterial color="#555b66" metalness={0.8} />
          </mesh>
        ))}
        <mesh position={[0, 8, -1.8]}>
          <boxGeometry args={[SW + 0.8, 0.4, 0.4]} />
          <meshStandardMaterial color="#555b66" metalness={0.8} />
        </mesh>
        <LedWall now={now} frame={frame} w={SW - 1.5} h={4.8} />
        {[-1, 1].map((s) => (
          <AvalancheLogo
            key={s}
            position={[s * (SW / 2 + 0.2), 9.3, -1.8]}
            scale={1 + pulse * 0.15}
            spin={now * 2 * s}
            glow={1.2 + pulse}
          />
        ))}
        {[-4.5, -1.5, 1.5, 4.5].map((x, i) => (
          <Beam
            key={x}
            position={[(x * SW) / 12, 7.7, -1.6]}
            color={["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b"][(i + Math.floor(n / 4)) % 4]}
            angle={Math.sin((n + p) * Math.PI * 0.5 + i) * 0.6}
            tilt={-0.5 + Math.sin(now * 1.3 + i) * 0.2}
          />
        ))}
        {/* the DJ: our guy, headphones on, laptop open */}
        <mesh position={[0, stageH + 0.25, -0.9]}>
          <boxGeometry args={[3.2, 0.5, 1.8]} />
          <meshStandardMaterial color="#15151f" metalness={0.4} roughness={0.4} />
        </mesh>
        <group position={[0, stageH + 0.5, -0.9]}>
          <mesh position={[0, 0.5, 0.45]}>
            <boxGeometry args={[2.4, 1, 0.7]} />
            <meshStandardMaterial color="#0d1418" />
          </mesh>
          <mesh position={[0, 0.5, 0.81]}>
            <planeGeometry args={[0.8, 0.8]} />
            <meshBasicMaterial color={T.logoLight} transparent opacity={0.85} toneMapped={false} />
          </mesh>
          <Person
            pose={{
              ...STAND,
              hipY: 0.55 - pulse * 0.05,
              headX: 0.15 + pulse * 0.3,
              lSh: [-1, 0.3],
              rSh: n % 4 === 0 ? [-0.2, 2.6] : [-1, 0.3],
              lEl: -0.9,
              rEl: n % 4 === 0 ? -0.2 : -0.9,
            }}
            position={[0, 0, -0.2]}
            look={HERO}
            name="Võ Quang Chiến"
            face={n % 8 < 4 ? "grin" : "laugh"}
            t={now}
            overHead={
              <mesh position={[0, -0.05, 0]} rotation={[0, Math.PI / 2, 0]}>
                <torusGeometry args={[0.31, 0.04, 8, 24, Math.PI]} />
                <meshStandardMaterial color="#ff3d7f" />
              </mesh>
            }
          />
        </group>
        {/* the crew */}
        {CREW.map((look, i) => {
          const a = prev[i];
          const b = formation[i];
          const pos: V3 = [a[0] + (b[0] - a[0]) * moveK, stageH, a[2] + (b[2] - a[2]) * moveK];
          const step = move === "step" ? (n % 2 ? 0.35 : -0.35) * Math.min(1, p * 3) : 0;
          return (
            <Person
              key={i}
              pose={pose}
              position={[pos[0] + step, pos[1], pos[2]]}
              look={look}
              face={move === "jump" || move === "clap" ? "laugh" : "grin"}
              t={now + i}
              blink={(n + i) % 11 === 0 && p < 0.15}
              name={CREW_NAMES[i]}
            />
          );
        })}
        {/* the robot dances too, a bit off-beat */}
        <group
          position={[SW / 2 - 0.8, stageH + 0.2 + Math.abs(Math.sin((n + p) * Math.PI)) * 0.4, 2.2]}
          rotation={[0, Math.sin((n + p) * Math.PI) * 0.8, Math.sin((n + p) * Math.PI) * 0.2]}
        >
          <Robot name="Lê Văn Dũng" position={[0, 0, 0]} t={now} face="wow" scale={0.9} />
        </group>
        {/* crowd */}
        {fans.map((f, i) => {
          const local = beatGrid(now - f.phase * BEAT);
          const jump = Math.sin(Math.min(1, local.p * 1.6) * Math.PI) * (i % 4 === 0 ? 1 : 0.6);
          return (
            <Fan
              key={i}
              position={f.p}
              color={f.color}
              skin={f.skin}
              jump={jump}
              arms={0.6 + jump * 0.4}
              stick={f.stick}
            />
          );
        })}
        {/* confetti at the top of every bar */}
        {[0, 1, 2].map((k) => {
          const barStart = (Math.floor(n / 4) - k) * 4;
          const age = (n - barStart + p) * BEAT;
          return (
            <Burst
              key={k}
              position={[0, stageH + 6, 3]}
              age={age}
              count={60}
              speed={5}
              life={2.3}
              seed={barStart}
              colors={["#ff3d7f", "#00c2ff", "#ffd23f", "#7cff6b", "#ffffff"]}
            />
          );
        })}
        <IdeaCube
          position={[0, stageH + 9.5 + Math.sin(now) * 0.3, -1.8]}
          size={0.9 + pulse * 0.25}
          t={now}
          light={false}
        />
      </group>
      <Fireworks t={now} bursts={bursts} />
    </Scene3D>
  );
};
