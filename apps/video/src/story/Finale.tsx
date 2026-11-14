import { useMemo } from "react";
import { AvalancheLogo } from "../three/avalanche";
import { AbsoluteFill, interpolate } from "remotion";
import { beatPulse } from "../lib/audio";
import { pop, ramp, useLocal } from "../lib/motion";
import { mono, sans, T } from "../lib/theme";
import { cheer, Person, reachUp, STAND, wave, type Look, type Pose } from "../three/person";
import {
  Bubble,
  Burst,
  Fireworks,
  IdeaCube,
  LogoCubes,
  Mountain,
  Robot,
  Room,
  Vault,
} from "../three/props";
import { drawBillboard } from "../three/screens";
import {
  arc,
  Cam,
  rand,
  Scene3D,
  seg,
  useCanvasTexture,
  type CamKey,
  type V3,
} from "../three/stage";
import { AvalancheMark, Logo, Wordmark } from "../ui/kit";
import { JobStages } from "./ui-scenes";
import { ProjectedUI, screenCorners } from "../three/projector";
import { HeroMan, HERO, NEIGHBOR, TOWN } from "./cast";
import { FamilyAtDoor } from "./family";
import { ACROSS, roofTop } from "../three/hue";
import { NGO_MON, UP, upKeys, World } from "./world";

// The bridge, the final chorus and the bedtime outro.

/** The vault stands in the Noon Gate's centre door; the scene is written
 * relative to O, with the vault at z = -20. */
const O: V3 = [NGO_MON[0], 0, NGO_MON[2] + 20];
const o = (p: V3): V3 => [p[0] + O[0], p[1] + O[1], p[2] + O[2]];
/** The vault's status display, on a post beside the door. */
const VAULT_SCREEN: V3 = [2.7, 2.3, -18.4];
const CUBES: V3 = [0, 24, -24];

/** A fighter's guard: fists up, bouncing on the toes. */
const guard = (t: number): Pose => ({
  ...STAND,
  hipY: 0.53 + Math.abs(Math.sin(t * 6)) * 0.03,
  lKnee: 0.25,
  rKnee: 0.25,
  lHip: -0.15,
  rHip: -0.1,
  headX: 0.15,
  lSh: [-1.0, 0.35],
  rSh: [-0.8, 0.35],
  lEl: -2.1,
  rEl: -2.3,
});
const FIGHTER = (
  skin: string,
  shirt: string,
  pants: string,
  hair: string,
  extra: Partial<Look> = {},
): Look => ({
  skin,
  shirt,
  pants,
  hair,
  hairStyle: "short",
  shoes: "#111",
  ...extra,
});
const FIGHTERS: [string, Look][] = [
  ["Conor McGregor", FIGHTER("#f2c9a0", "#1b1b1b", "#c9a227", "#8a4a22", { beard: true })],
  ["Trương Đình Hoàng", FIGHTER("#d9a07a", "#e63946", "#111", "#111")],
  ["Thức Venum", FIGHTER("#c68a5e", "#111", "#e63946", "#111", { hairStyle: "spiky" })],
  ["Phương Te", FIGHTER("#e0a77f", "#2a9d8f", "#111", "#111", { hairStyle: "bald" })],
  ["Nguyễn Hữu Hân", FIGHTER("#d9a07a", "#3a86ff", "#1b1b1b", "#111")],
  ["Châu La", FIGHTER("#f2c9a0", "#ffd166", "#111", "#111", { hairStyle: "spiky" })],
];

export type VaultMarks = { kept: number; payvoke: number; powered: number; end: number };

/** "Kept safe until the work's complete. Payvoke... powered by Avalanche." */
export const VaultBridge = ({ at, m }: { at: number; m: VaultMarks }) => {
  const { t, frame, fps } = useLocal();
  const now = at + t;
  const inside = seg(now, at, m.kept + 0.3);
  const doorOpen =
    now < m.kept + 0.4
      ? 1 - seg(now, m.kept, m.kept + 0.4)
      : seg(now, m.payvoke - 0.7, m.payvoke - 0.2);
  const dial = seg(now, m.kept + 0.5, m.payvoke - 0.8) * Math.PI * 6;
  const progress = interpolate(now, [m.kept + 0.3, m.payvoke - 0.7], [1.2, 5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rise = seg(now, m.payvoke - 0.2, m.payvoke + 1.4);
  const assemble = seg(now, m.payvoke + 0.6, m.payvoke + 2.6);
  const glow = 0.4 + seg(now, m.powered - 0.3, m.powered + 0.6) * 1.6;
  const pulse = beatPulse(now, 0.3);

  const keys: CamKey[] = (
    [
      { t: at, pos: [9, 3.6, -4], look: [0, 3.2, -20], fov: 48 },
      { t: m.payvoke - 0.8, pos: [4, 2.8, -11], look: [0, 2.6, -20], fov: 44 },
      // back out through the Citadel gate: the gate, the logo, the mountain
      { t: m.payvoke + 1.2, pos: [0, 4, 3], look: [0, 16, -33], fov: 55 },
      { t: m.powered, pos: [0, 5, 11], look: [0, 22, -53], fov: 58 },
      { t: m.end, pos: [0, 7, 19], look: [0, 26, -63], fov: 60 },
    ] as CamKey[]
  ).map((k) => ({ ...k, pos: o(k.pos), look: o(k.look) }));
  const stagesShow =
    (now > m.kept + 0.2 ? 1 : 0) * (1 - seg(now, m.payvoke - 0.2, m.payvoke + 0.2));
  const mark = pop(frame, fps, m.payvoke + 1.4 - at, 13);
  const powered = pop(frame, fps, m.powered - at, 13);

  return (
    <AbsoluteFill>
      <Scene3D env={0.3}>
        <Cam keys={keys} t={now} />
        <World t={now} time={1} traffic={false} people={false} plaza={false} />
        <group position={O}>
          <hemisphereLight args={["#9aaae0", "#2a3330", 0.9]} />
          <pointLight
            position={[3, 5, -14]}
            color="#ffe2b8"
            intensity={30}
            distance={20}
            decay={1}
          />
          <Mountain position={[0, 0, -85]} scale={3.2} glow={glow + pulse * 0.4} />
          {now > m.powered - 0.4 && (
            <>
              {[-1, 1].map((sd) => (
                <AvalancheLogo
                  key={sd}
                  position={[sd * 15, 25, -48]}
                  scale={4.2 * seg(now, m.powered - 0.4, m.powered + 0.6)}
                  spin={Math.sin((now - m.powered) * 1.5) * 0.4 - sd * 0.25}
                  glow={glow + pulse * 0.5}
                />
              ))}
            </>
          )}
          {/* the vault's guards */}
          {FIGHTERS.map(([name, look], i) => (
            <Person
              key={name}
              pose={guard(now + i * 0.37)}
              position={[-2.4 - i * 1.05, 0, -16.6 + (i % 2) * 0.5]}
              rotation={0.35}
              look={look}
              face={i === 0 ? "grin" : "angry"}
              t={now}
              name={name}
              tagLift={(i % 2) * 0.3}
            />
          ))}
          <Vault position={[0, 0, -20]} open={doorOpen} dial={dial}>
            <IdeaCube position={[0, 1.4, 0.3]} size={0.4} t={now} glow={0.8} />
          </Vault>
          {inside < 1 && (
            <IdeaCube
              position={arc([-10, 10, -8], [0, 1.4, -18.7], inside, 2)}
              size={0.35}
              t={now}
            />
          )}
          <Burst
            position={[0, 1.6, -18.5]}
            age={now - (m.payvoke - 0.2)}
            count={60}
            speed={4}
            life={2}
          />
          {rise > 0 && (
            <IdeaCube
              position={arc([0, 1.6, -18.5], CUBES, rise, 2)}
              size={0.5 * (1 - assemble)}
              t={now}
            />
          )}
          <group position={VAULT_SCREEN} rotation={[0, 0.4, 0]}>
            <mesh position={[0, 0, -0.06]}>
              <boxGeometry args={[2.6, 1.55, 0.1]} />
              <meshStandardMaterial color="#1a1f22" />
            </mesh>
            <mesh position={[0, -1.2, -0.1]}>
              <boxGeometry args={[0.15, 1.6, 0.15]} />
              <meshStandardMaterial color="#59646b" metalness={0.6} />
            </mesh>
          </group>
          {assemble > 0 && (
            <LogoCubes position={CUBES} scale={2.4} assemble={assemble} t={now} pulse={pulse} />
          )}
        </group>
      </Scene3D>
      {/* the vault's own display shows the job, in the real UI */}
      {stagesShow > 0.01 && (
        <ProjectedUI
          keys={keys}
          t={now}
          corners={screenCorners(o(VAULT_SCREEN), 2.4, 1.35, 0.4)}
          opacity={stagesShow}
          uiW={960}
          uiH={540}
        >
          <AbsoluteFill
            style={{
              background: T.bg,
              alignItems: "center",
              justifyContent: "center",
              fontFamily: sans,
            }}
          >
            <div style={{ display: "grid", gap: 34, justifyItems: "center" }}>
              <span style={{ fontSize: 34, color: T.text2 }}>
                Jingle for Bean There ·{" "}
                <span style={{ fontFamily: mono, color: T.text }}>$2.50 held for this job</span>
              </span>
              <JobStages progress={progress} style={{ width: 860 }} />
            </div>
          </AbsoluteFill>
        </ProjectedUI>
      )}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: 110,
          fontFamily: sans,
        }}
      >
        <div style={{ display: "grid", justifyItems: "center", gap: 22 }}>
          <div
            style={{
              opacity: mark * (1 - stagesShow),
              scale: 0.9 + mark * 0.1,
              filter: "drop-shadow(0 4px 30px #000)",
            }}
          >
            <Wordmark size={150} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 48,
              color: T.text,
              opacity: powered,
              scale: 0.9 + powered * 0.1,
              textShadow: "0 2px 20px #000",
            }}
          >
            Powered by <AvalancheMark size={60} /> <b>Avalanche</b>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SLOGANS = [
  "Got a little idea?",
  "Give it a name.",
  "Put it on Payvoke.",
  "Someone needs it.",
  "Get paid when it helps.",
  "Pass it on.",
];

const SloganBoard = ({ i, position }: { i: number; position: V3 }) => {
  const tex = useCanvasTexture(1024, 512, `slogan-${i}`, (ctx, w, h) =>
    drawBillboard(ctx, w, h, SLOGANS[i], "payvoke."),
  );
  return (
    <mesh position={position}>
      <planeGeometry args={[20, 10]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
};

/** Five flat roofs across his street, nearest x = -12, -6, 0, 6, 12. */
const PARTY = [-12, -6, 0, 6, 12].map((x) =>
  ACROSS.reduce((best, lot) => (Math.abs(lot.x - x) < Math.abs(best.x - x) ? lot : best)),
);

/** A đá cầu kick: the right leg swings up, arms out for balance. */
const kick = (k: number): Pose => {
  const up = Math.sin(Math.min(1, k) * Math.PI);
  return {
    ...STAND,
    lean: -0.12 * up,
    headX: 0.35,
    rHip: -0.3 - up * 1.3,
    rKnee: 0.5 - up * 0.4,
    lKnee: 0.1,
    lSh: [-0.2, 1.3],
    rSh: [-0.2, 1.1],
    lEl: -0.3,
    rEl: -0.3,
  };
};

/** Final chorus and finale: the whole town on the rooftops, ideas flying. */
export const Rooftops = ({
  at,
  f,
  finale,
  end,
}: {
  at: number;
  f: [number, number, number, number];
  finale: number;
  end: number;
}) => {
  const { t } = useLocal();
  const now = at + t;
  const pulse = beatPulse(now, 0.3);
  const top = (i: number): V3 => [PARTY[i].x, roofTop(PARTY[i]), -14.3];
  const looks = [TOWN[0], NEIGHBOR, HERO, TOWN[2], TOWN[4]];
  const names = ["Lê Văn Duy Anh", "Khiêm", "Võ Quang Chiến", "Thái Tuấn", "Đình Thương"];

  // A cube hops roof to roof along the row, back and forth, all chorus long.
  const hop = 0.9;
  const hopIndex = Math.floor(Math.max(0, now - f[0]) / hop);
  const hopK = (Math.max(0, now - f[0]) % hop) / hop;
  // Đá cầu: the idea is kicked roof to roof like a shuttlecock; Chiến first.
  const path = [2, 1, 0, 1, 2, 3, 4, 3];
  const from = path[hopIndex % path.length];
  const to = path[(hopIndex + 1) % path.length];
  const hopping = now >= f[0] && now < finale;
  const hopPos = arc(
    [top(from)[0], top(from)[1] + 0.55, top(from)[2] + 0.35],
    [top(to)[0], top(to)[1] + 0.55, top(to)[2] + 0.35],
    hopK,
    3.2,
  );

  const bursts = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        at: f[0] + i * 0.62 + rand(i) * 0.2,
        pos: [(rand(i + 1) - 0.5) * 80, 22 + rand(i + 2) * 18, -50 - rand(i + 3) * 40] as V3,
        color: [T.brand, T.sunset, "#f7e27a", T.dusk, T.logoLight, "#f4a6b8"][i % 6],
      })),
    [f],
  );
  const lanterns = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        x: (rand(i) - 0.5) * 80,
        z: -28 - rand(i + 5) * 34,
        d: rand(i + 9) * 3,
      })),
    [],
  );
  const slogan = Math.min(
    SLOGANS.length - 1,
    Math.floor(Math.max(0, now - finale) / ((end - finale - 3) / SLOGANS.length)),
  );
  const raise = now >= f[3];
  const boardsUp = seg(now, finale - 0.5, finale + 1.5);

  const keys: CamKey[] = [
    { t: at, pos: [0, 12.5, -2.5], look: [0, 10.4, -15], fov: 58 },
    { t: f[1], pos: [-3, 14.5, -1.5], look: [0, 10.4, -15], fov: 58 },
    { t: f[2], pos: [3, 15, -1.5], look: [0, 10.4, -15], fov: 58 },
    { t: f[3], pos: [0, 14, -2], look: [0, 10.8, -15], fov: 56 },
    { t: finale, pos: [0, 14, -1], look: [0, 15, -30], fov: 54 },
    { t: finale + 10, pos: [-10, 18, 8], look: [0, 18, -45], fov: 54 },
    { t: end, pos: [0, 24, 16], look: [0, 20, -55], fov: 54 },
  ];

  return (
    <Scene3D env={0.15}>
      <Cam keys={keys} t={now} shake={pulse * 0.04} />
      <World t={now} time={1} lit={(h, w) => rand(h * 3 + w) > 0.35} plaza={false} />
      <ambientLight intensity={0.5} color="#b46bff" />
      {PARTY.map((_, i) => {
        const kicking = hopping && hopK < 0.22 && i === from;
        const ready = hopping && hopK > 0.6 && i === to;
        const pose: Pose = raise
          ? reachUp(STAND)
          : kicking
            ? kick(hopK / 0.22)
            : ready
              ? {
                  ...STAND,
                  hipY: 0.5,
                  lKnee: 0.4,
                  rKnee: 0.4,
                  lHip: -0.3,
                  rHip: -0.3,
                  headX: -0.4,
                  lSh: [-0.2, 1.1],
                  rSh: [-0.2, 1.1],
                }
              : i === 2
                ? cheer(now)
                : i % 2
                  ? wave(now + i, STAND)
                  : cheer(now + i * 0.3);
        return (
          <Person
            key={i}
            pose={pose}
            position={top(i)}
            rotation={0}
            look={looks[i]}
            name={names[i]}
            face={kicking ? "laugh" : "grin"}
            overHead={
              raise && now < finale + 2 ? (
                <IdeaCube
                  position={[0, 0.7 + seg(now, f[3], f[3] + 2) * 0.4, 0]}
                  size={0.26}
                  t={now + i}
                  light={false}
                />
              ) : undefined
            }
          />
        );
      })}
      {hopping && <IdeaCube position={hopPos} size={0.3} t={now} />}
      {/* "you found a way, I found one too": beams between the roofs */}
      {now >= f[2] && now < f[3] && (
        <>
          <Beam a={top(1)} b={top(3)} k={seg(now, f[2], f[2] + 1.2)} color={T.brand} />
          <Beam a={top(0)} b={top(4)} k={seg(now, f[2] + 0.6, f[2] + 1.8)} color={T.sunset} />
        </>
      )}
      <Robot
        name="Lê Văn Dũng"
        position={[
          Math.sin(now * 0.7) * 10,
          18 + Math.sin(now * 1.3) * 1.5,
          -18 + Math.cos(now * 0.7) * 4,
        ]}
        rotation={now * 0.7}
        t={now}
        face="wow"
      />
      <Fireworks t={now} bursts={bursts} />
      {lanterns.map((l, i) => {
        const k = now - (f[3] + 0.5 + l.d);
        if (k < 0) return null;
        return (
          <IdeaCube
            key={i}
            light={false}
            position={[l.x, 6 + k * 1.6, l.z]}
            size={0.6}
            t={now + i}
          />
        );
      })}
      {boardsUp > 0 && <SloganBoard i={slogan} position={[0, 21 + (1 - boardsUp) * -10, -32]} />}
      {now > finale + 8 && (
        <LogoCubes
          position={[0, 34, -62]}
          scale={3.2}
          assemble={seg(now, finale + 8, finale + 11)}
          t={now}
          pulse={pulse}
        />
      )}
    </Scene3D>
  );
};

const Beam = ({ a, b, k, color }: { a: V3; b: V3; k: number; color: string }) => (
  <>
    {Array.from({ length: 24 }, (_, i) => {
      const u = i / 23;
      if (u > k) return null;
      const p = arc([a[0], a[1] + 1.2, a[2] + 0.3], [b[0], b[1] + 1.2, b[2] + 0.3], u, 3);
      return (
        <mesh key={i} position={p}>
          <sphereGeometry args={[0.09, 8, 6]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      );
    })}
  </>
);

/** Finally in bed. The idea glows on the shelf, the laptop sleeps. */
export const Bedtime = () => {
  const { t, dur, frame, fps } = useLocal();
  const keys: CamKey[] = [
    { t: 0, pos: [1.25, 1.55, -0.1], look: [2.05, 0.75, 0.15], fov: 42 },
    { t: dur * 0.3 - 0.001, pos: [0.4, 1.8, 2.2], look: [1.6, 0.8, -0.4], fov: 45 },
    // cut: the family looking in from the back of the room
    { t: dur * 0.3, pos: [2.5, 1.95, -1.7], look: [-1.1, 1.15, 1.6], fov: 54 },
    { t: dur, pos: [2.2, 1.9, -1.35], look: [-1.1, 1.15, 1.6], fov: 52 },
  ];
  const card = pop(frame, fps, dur * 0.62, 16);
  const out = 1 - ramp(t, dur - 2.5, dur - 0.2);
  const zs = [0, 1, 2].map((i) => (t * 0.5 + i / 3) % 1);
  return (
    <AbsoluteFill>
      <Scene3D env={0.25}>
        <Cam keys={upKeys(keys)} t={t} />
        <World t={t + 256} time={1} lit={() => false} heroLit={0} />
        <group position={[0, UP, 0]}>
          <Room
            t={t}
            screen={{ kind: "saver" }}
            screenKey="saver"
            mugs={1}
            lamp={0}
            clock={[1, 12]}
          >
            <pointLight
              position={[0, 2.2, -2.2]}
              color="#9fb0e0"
              intensity={6}
              distance={8}
              decay={1}
            />
            <IdeaCube position={[2.3, 1.85, -2.35]} size={0.2} t={t * 0.3} glow={0.9} />
          </Room>
          {/* lying down: the person rotated onto the bed */}
          <group position={[2.05, 0.7, 0.0]} rotation={[-Math.PI / 2, 0, 0]}>
            <HeroMan
              position={[0, -1.5, 0]}
              rotation={0}
              pose={{ ...STAND, lSh: [0, 0.3], rSh: [0, 0.3], headZ: Math.sin(t * 0.8) * 0.05 }}
              face="sleep"
              shadow={false}
            />
          </group>
          {t > dur * 0.28 && <FamilyAtDoor t={t} names={t > dur * 0.33 && t < dur * 0.62} />}
          {/* the blanket, pulled up to his chin and draped over the sides */}
          <group position={[2.05, 0, 0.98]}>
            <mesh position={[0, 0.81, 0]}>
              <boxGeometry args={[1.36, 0.26, 1.34]} />
              <meshStandardMaterial color="#c0605a" roughness={0.9} />
            </mesh>
            <mesh position={[0, 0.94, 0]} rotation={[0, 0, Math.PI / 2]} scale={[0.14, 1, 1]}>
              <cylinderGeometry args={[0.68, 0.68, 1.34, 20, 1, false, 0, Math.PI]} />
              <meshStandardMaterial color="#c0605a" roughness={0.9} />
            </mesh>
            {/* the folded-back sheet under his chin */}
            <mesh position={[0, 0.95, -0.64]}>
              <boxGeometry args={[1.38, 0.08, 0.16]} />
              <meshStandardMaterial color="#f3efe6" />
            </mesh>
          </group>
          {zs.map((k, i) => (
            <Bubble
              key={i}
              position={[2.25 + k * 0.4, 1.0 + k * 0.9, -0.5]}
              rotation={-0.6}
              lines={["z"]}
              w={0.35}
              h={0.35}
              scale={Math.sin(k * Math.PI)}
            />
          ))}
        </group>
      </Scene3D>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          fontFamily: sans,
          opacity: card * out,
          background: `radial-gradient(ellipse 50% 40% at 50% 50%, #0c1512dd, transparent 80%)`,
        }}
      >
        <div
          style={{ display: "grid", justifyItems: "center", gap: 26, scale: 0.95 + card * 0.05 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <Logo size={100} />
            <Wordmark size={120} />
          </div>
          <span style={{ fontSize: 38, color: T.text2 }}>
            Hire AI agents. Pay only for what&apos;s delivered.
          </span>
          <span
            style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 24, color: T.muted }}
          >
            Pay per job · x402 · <AvalancheMark size={30} /> Avalanche
          </span>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: 1 - out }} />
    </AbsoluteFill>
  );
};
