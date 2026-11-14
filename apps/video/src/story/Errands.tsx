import { AbsoluteFill } from "remotion";
import { useLocal } from "../lib/motion";
import { T } from "../lib/theme";
import {
  cheer,
  headInHands,
  holding,
  listening,
  Person,
  poseTrack,
  SIT,
  STAND,
  talking,
  wave,
  type Pose,
} from "../three/person";
import { TubeHouse, tubeSpec } from "../three/hue";
import { Bubble, Burst, Coin, IdeaCube, Room, Robot, ThoughtBubble } from "../three/props";
import { arc, Cam, Scene3D, seg, type CamKey, type V3 } from "../three/stage";
import { HeroMan, NEIGHBOR, TOWN } from "./cast";
import { UP, World } from "./world";

// Verse 2 out in the street: his AI assistant runs an errand across the
// road, and two neighbours trade ideas from their front paths.

const SHOP_X = 13;
const LOGO_SHOP = { ...tubeSpec(77, 6, 6.8, true), open: true, awning: "#3d5a80", signColor: 1 };

/** A gift box with a jade ribbon: the delivered logo. */
const Gift = () => (
  <group>
    <mesh>
      <boxGeometry args={[0.32, 0.26, 0.32]} />
      <meshStandardMaterial color="#f3efe0" />
    </mesh>
    <mesh>
      <boxGeometry args={[0.34, 0.27, 0.07]} />
      <meshStandardMaterial color={T.logo} />
    </mesh>
    <mesh>
      <boxGeometry args={[0.07, 0.27, 0.34]} />
      <meshStandardMaterial color={T.logo} />
    </mesh>
  </group>
);

export type ErrandMarks = {
  start: number;
  found: number;
  asked: number;
  paid: number;
  end: number;
};

/**
 * "When I needed help of my own, my assistant went and found one": a robot
 * climbs out of his laptop, flies across the street to Logo Smith, asks
 * what it can do, pays within his limit and brings the logo home.
 */
export const RobotErrand = ({ m }: { m: ErrandMarks }) => {
  const { t } = useLocal();
  const now = m.start + t;
  const pop1 = seg(now, m.start + 1.0, m.start + 1.6);
  const window: V3 = [0, UP + 1.9, -2.9];
  const shopFront: V3 = [SHOP_X, 1.25, -11.6];
  const flyOut = seg(now, m.found + 0.2, m.asked - 0.4);
  const flyHome = seg(now, m.end - 1.4, m.end);
  const handOver = m.paid + 1.3;
  let robot: V3 = [0, UP + 0.95 + pop1 * 0.2, -2.15];
  if (now >= m.found)
    robot = arc([0, UP + 1.2, -2.05], window, seg(now, m.found, m.found + 0.3), 0.2);
  if (flyOut > 0) robot = arc(window, shopFront, flyOut, 3);
  if (flyHome > 0) robot = arc(shopFront, window, flyHome, 3);
  const coinK = seg(now, m.paid + 0.2, m.paid + 0.9);

  const cut = (time: number, pos: V3, look: V3, fov = 42): CamKey[] => [
    { t: time - 0.001, pos, look, fov },
    { t: time, pos, look, fov },
  ];
  const sx = SHOP_X;
  const keys: CamKey[] = [
    { t: m.start, pos: [1.6, UP + 1.4, -1.65], look: [0, UP + 1.15, -1.95], fov: 42 },
    { t: m.found - 0.05, pos: [1.4, UP + 1.5, -1.3], look: [0, UP + 1.2, -2.1], fov: 42 },
    ...cut(m.found + 0.3, [10, 4.5, -10.5], [3, 4.4, -6], 50),
    { t: m.asked - 0.3, pos: [sx + 5, 2.6, -9.2], look: [sx, 1.6, -11.5], fov: 44 },
    ...cut(m.asked, [sx + 5.4, 2.3, -8.3], [sx - 0.4, 2.0, -12.6], 48),
    { t: m.end - 1.4, pos: [sx + 5.1, 2.3, -8.2], look: [sx - 0.4, 2.0, -12.6], fov: 48 },
    ...cut(m.end - 1.3, [9, 4.5, -11], [2, 4.2, -5], 48),
    { t: m.end, pos: [7, 4.8, -10], look: [1, 4.6, -4], fov: 48 },
  ];

  const hero: Pose = poseTrack(now, [
    { at: 0, pose: headInHands },
    {
      at: m.start + 1.0,
      pose: () => ({
        ...SIT,
        lean: -0.3,
        headX: -0.1,
        lSh: [-0.5, 0.9],
        rSh: [-0.5, 0.9],
        lEl: -1,
        rEl: -1,
      }),
    },
    { at: m.found, pose: (x) => cheer(x, SIT) },
  ]);
  const agent: Pose = poseTrack(now, [
    { at: 0, pose: () => ({ ...STAND, headX: 0.1 }) },
    { at: m.asked + 1.0, pose: (x) => talking(x, STAND, 1) },
    { at: m.paid + 0.8, pose: (x) => cheer(x) },
    { at: handOver, pose: () => holding(STAND) },
    { at: handOver + 0.6, pose: (x) => wave(x, STAND) },
  ]);
  const spent = 0.8 + seg(now, m.paid + 0.2, m.paid + 1) * 3.4;

  return (
    <AbsoluteFill>
      <Scene3D env={0.25}>
        <Cam keys={keys} t={now} />
        <World
          t={now}
          time={1}
          lit={() => false}
          skipAcross={[SHOP_X]}
          traffic={false}
          people={false}
        />
        <group position={[0, UP, 0]}>
          <Room
            t={now}
            screen={{ kind: "console", page: "chat" }}
            screenKey="console-chat"
            mugs={4}
            windowOpen={seg(now, m.found - 0.5, m.found)}
            clock={[23, 20]}
          />
          <HeroMan
            pose={hero}
            face={now >= m.found ? "laugh" : now > m.start + 1 ? "o" : "sad"}
            t={now}
            gaze={now > m.start + 1 ? [0, -0.4] : [0, -0.8]}
          />
        </group>
        {/* Logo Smith's little shop across the street */}
        <TubeHouse
          spec={LOGO_SHOP}
          position={[sx, 0, -13.7 - LOGO_SHOP.d / 2]}
          rotation={Math.PI}
          lit={() => true}
          night={1}
          signText={["LOGO SMITH", "Logo · Icon · Palette"]}
        />
        <Person
          pose={agent}
          position={[sx, 0, -13.3]}
          rotation={0}
          look={TOWN[2]}
          name="Huỳnh Đức Khánh"
          face={now > m.paid + 0.8 ? "laugh" : now > m.asked + 1 ? "talk" : "smile"}
          t={now}
          gaze={[0, 0.3]}
          inHands={now >= handOver && now < handOver + 0.6 ? <Gift /> : undefined}
        />
        <Robot
          name="Lê Văn Dũng"
          scale={
            now < m.found ? 0.42 * pop1 + 0.001 : 0.42 + seg(now, m.found, m.found + 1.2) * 0.48
          }
          position={robot}
          rotation={flyHome > 0 ? 0 : now >= m.found ? Math.PI : 0}
          t={now}
          face={now >= m.asked && now < m.paid ? "talk" : "wow"}
          carry={now >= handOver + 0.4 ? <Gift /> : undefined}
        />
        <Bubble
          position={[sx + 1.1, 2.75, -12.2]}
          rotation={Math.PI / 2}
          lines={["What can you do?"]}
          w={1.9}
          h={0.75}
          scale={seg(now, m.asked, m.asked + 0.25) * (1 - seg(now, m.asked + 1.0, m.asked + 1.2))}
        />
        <Bubble
          position={[sx + 0.6, 2.25, -13.0]}
          rotation={Math.PI / 2}
          lines={["/logo", "/icon", "/palette"]}
          mono
          accent
          w={1.6}
          h={1.5}
          scale={seg(now, m.asked + 1.0, m.asked + 1.25) * (1 - seg(now, m.paid, m.paid + 0.2))}
        />
        {/* the robot checks the budget out loud before paying */}
        <Bubble
          position={[sx + 1.1, 2.75, -12.2]}
          rotation={Math.PI / 2}
          lines={[`$${spent.toFixed(2)} of my $10 limit`, "paid over x402 ✓"]}
          mono
          w={2.1}
          h={1.15}
          scale={seg(now, m.paid, m.paid + 0.25) * (1 - seg(now, handOver, handOver + 0.2))}
        />
        {coinK > 0 && coinK < 1 && (
          <Coin position={arc([sx, 1.3, -11.8], [sx, 1.2, -13], coinK, 0.9)} t={now} />
        )}
        <Burst
          position={[sx, 1.4, -13]}
          age={now - (m.paid + 0.9)}
          count={30}
          colors={["#f2c14e", "#fff1a8", T.brand]}
        />
      </Scene3D>
    </AbsoluteFill>
  );
};

/**
 * Two front paths across the street. "exchange": ideas fly both ways.
 * "need": he holds his idea up, she needs one, and it flies off to be
 * kept safe (the vault scene follows).
 */
export const Windows = ({
  mode,
  at,
  beat,
}: {
  mode: "exchange" | "need";
  at: number;
  beat: number;
}) => {
  const { t, dur } = useLocal();
  const now = at + t;
  const his: V3 = [0, 1.05, -4.75];
  const hers: V3 = [0, 1.05, -12.55];
  const keys: CamKey[] =
    mode === "exchange"
      ? [
          { t: 0, pos: [11, 2.4, -7.2], look: [0, 1.6, -8.6], fov: 50 },
          { t: dur, pos: [9.5, 3.6, -9.6], look: [0, 1.6, -8.6], fov: 50 },
        ]
      : [
          { t: 0, pos: [-13.5, 2.6, -8.6], look: [0, 1.6, -8.6], fov: 56 },
          { t: dur * 0.7, pos: [-11, 2.4, -8.6], look: [0, 1.7, -8.6], fov: 54 },
          { t: dur, pos: [-6, 5, -8], look: [0, 6, -12], fov: 50 },
        ];

  const flights =
    mode === "exchange"
      ? Array.from({ length: Math.floor(dur / beat) + 1 }, (_, i) => i * beat + 0.3)
      : [];
  const flyUp = mode === "need" ? seg(t, dur - 1.6, dur) : 0;
  const swap = Math.floor(t / beat) % 2;

  return (
    <Scene3D env={0.45}>
      <Cam keys={keys} t={t} />
      <World
        t={now}
        traffic={false}
        people={false}
        time={mode === "exchange" ? 0.75 : 0.65}
        lit={(h, w) => (h * 3 + w) % 4 === 0}
      />
      <HeroMan
        position={[0, 0, -4.4]}
        pose={
          mode === "exchange"
            ? swap
              ? holding(STAND)
              : cheer(now)
            : flyUp > 0
              ? wave(now, STAND)
              : holding(STAND)
        }
        face={mode === "exchange" ? "laugh" : "grin"}
        name="Võ Quang Chiến"
        t={now}
        inHands={mode === "need" && flyUp === 0 ? <IdeaCube size={0.22} t={now} /> : undefined}
      />
      <Person
        pose={
          mode === "exchange"
            ? swap
              ? cheer(now)
              : holding(STAND)
            : flyUp > 0
              ? cheer(now)
              : listening(now)
        }
        position={[0, 0, -12.9]}
        rotation={0}
        look={NEIGHBOR}
        name="Mỹy Hạnh"
        face={mode === "need" && flyUp === 0 ? "o" : "laugh"}
        t={now}
        overHead={
          mode === "need" && flyUp === 0 ? (
            <ThoughtBubble t={now} scale={0.9} stuck={false} />
          ) : undefined
        }
      />
      {mode === "need" && (
        <Bubble
          position={[-0.3, 2.7, -11.7]}
          rotation={-1.3}
          lines={["I need a jingle!"]}
          w={2}
          h={0.75}
          scale={seg(t, 0.8, 1.1)}
        />
      )}
      {flights.map((f, i) => {
        const k = (t - f) / (beat * 0.9);
        if (k < 0 || k > 1) return null;
        const [a, b] = i % 2 ? [hers, his] : [his, hers];
        return <IdeaCube key={i} position={arc(a, b, k, 2.5)} size={0.24} t={now + i} />;
      })}
      {flyUp > 0 && <IdeaCube position={arc(his, [0, 14, -40], flyUp, 3)} size={0.26} t={now} />}
    </Scene3D>
  );
};
