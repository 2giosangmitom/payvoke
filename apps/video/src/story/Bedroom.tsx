import { useLocal } from "../lib/motion";
import {
  cheer,
  facepalm,
  holding,
  Person,
  poseTrack,
  reachUp,
  SIT,
  slumped,
  STAND,
  track,
  typing,
  walk,
  wave,
  type Pose,
} from "../three/person";
import { Burst, IdeaCube, Jar, Room, Snail, ThoughtBubble } from "../three/props";
import type { Screen } from "../three/screens";
import { arc, Cam, rand, Scene3D, seg, type CamKey } from "../three/stage";
import { HeroMan, TOWN } from "./cast";
import { UP, upKeys, World } from "./world";

// Verse 1 and the first pre-chorus, all in his bedroom. Every lyric line
// is one beat of action; times are absolute song seconds.

export type BedroomMarks = {
  late: number;
  hundred: number;
  slow: number;
  tool: number;
  broke: number;
  smile: number;
  help: number;
  keep: number;
  share: number;
  end: number;
};

const CODE = `// clear-the-way.ts
export async function clearTheWay(idea) {
  const steps = await plan(idea)
  return steps.map(automate)
}`;

export const BedroomScene = ({ at, m }: { at: number; m: BedroomMarks }) => {
  const { t } = useLocal();
  const now = at + t;
  const broke2 = m.broke + 0.9;
  const dawn = m.broke + 1.55;
  const day = seg(now, dawn, dawn + 1);
  const standUp = m.share + 1.6;
  const release = m.share + 3.9;

  const cut = (
    time: number,
    pos: [number, number, number],
    look: [number, number, number],
    fov = 45,
  ): CamKey[] => [
    { t: time - 0.001, pos, look, fov },
    { t: time, pos, look, fov },
  ];
  const keys: CamKey[] = [
    { t: at, pos: [2.5, 1.45, 2.1], look: [2.0, 0.5, 0.3], fov: 45 },
    { t: m.late + 1.4, pos: [1.6, 1.9, 1.2], look: [-1.9, 2.3, -2.4], fov: 42 },
    { t: m.hundred - 0.4, pos: [0.9, 1.65, 0.3], look: [0, 1.05, -2.0], fov: 45 },
    ...cut(m.hundred, [0, 1.75, 1.9], [0, 1.65, -2.4], 52),
    { t: m.slow - 0.2, pos: [-0.4, 1.7, 1.2], look: [0, 1.6, -2.4], fov: 50 },
    ...cut(m.slow, [1.9, 1.55, -0.7], [0.15, 1.0, -1.8], 42),
    { t: m.tool - 0.2, pos: [1.75, 1.5, -0.85], look: [0.15, 1.0, -1.8], fov: 40 },
    ...cut(m.tool, [0.75, 1.8, -0.45], [0, 1.0, -2.1], 46),
    { t: m.broke - 0.1, pos: [0.6, 1.72, -0.65], look: [0, 1.0, -2.1], fov: 44 },
    ...cut(m.broke, [2.3, 1.45, -1.2], [0, 1.1, -1.9], 44),
    { t: m.smile - 0.05, pos: [2.2, 1.5, -1.4], look: [0, 1.1, -1.9], fov: 44 },
    ...cut(m.smile, [1.7, 1.65, -1.15], [0, 1.35, -1.55], 40),
    { t: m.help - 0.05, pos: [1.5, 1.6, -1.25], look: [0, 1.35, -1.55], fov: 38 },
    ...cut(m.help, [0.4, 1.8, 0.7], [0, 1.4, -6], 45),
    { t: m.keep - 0.05, pos: [0.3, 1.7, 0.3], look: [0, 1.4, -6], fov: 45 },
    ...cut(m.keep, [-1.8, 1.45, -0.7], [0, 1.05, -1.45], 42),
    { t: m.share - 0.05, pos: [-1.5, 1.55, -0.6], look: [0, 1.1, -1.5], fov: 42 },
    ...cut(m.share, [-1.9, 2.0, 0.2], [0.1, 1.5, -2.5], 50),
    { t: release - 0.3, pos: [-1.4, 2.1, -0.4], look: [0.1, 1.9, -6], fov: 48 },
    { t: m.end, pos: [0, 1.6, -7.5], look: [0, -1.4, -13], fov: 50 },
  ];

  const pose: Pose = poseTrack(now, [
    {
      at: 0,
      pose: (x) => ({ ...typing(x, 0.5), headX: 0.05 + Math.max(0, Math.sin(x * 1.3)) * -0.35 }),
    },
    {
      at: m.hundred,
      pose: (x) => ({
        ...SIT,
        headY: Math.sin(x * 4.5) * 0.7,
        lSh: [-0.4, 0.7],
        rSh: [-0.4, 0.7],
        lEl: -0.6,
        rEl: -0.6,
        lean: -0.1,
      }),
    },
    { at: m.slow, pose: slumped },
    { at: m.tool, pose: (x) => typing(x, 2.6) },
    {
      at: m.broke,
      pose: () => ({
        ...SIT,
        lean: -0.35,
        headX: -0.2,
        lSh: [-0.6, 1.1],
        rSh: [-0.6, 1.1],
        lEl: -1.2,
        rEl: -1.2,
      }),
    },
    { at: m.broke + 0.45, pose: (x) => typing(x, 2.6) },
    {
      at: broke2,
      pose: () => ({
        ...SIT,
        lean: -0.4,
        headX: -0.25,
        lSh: [-0.6, 1.2],
        rSh: [-0.6, 1.2],
        lEl: -1.3,
        rEl: -1.3,
      }),
    },
    { at: broke2 + 0.4, pose: () => facepalm() },
    { at: dawn + 0.2, pose: (x) => typing(x, 1.2) },
    { at: m.smile, pose: (x) => cheer(x, SIT) },
    {
      at: m.help,
      pose: (x) => ({
        ...SIT,
        headX: -0.15,
        headY: Math.sin(x * 0.8) * 0.15,
        lSh: [-0.7, 0.2],
        rSh: [-0.7, 0.2],
        lEl: -0.9,
        rEl: -0.9,
      }),
    },
    {
      at: m.keep,
      pose: () => ({
        ...holding(SIT),
        lSh: [-0.9, 0.05],
        rSh: [-0.9, 0.05],
        lEl: -1.4,
        rEl: -1.4,
        twist: 0.5,
        headY: 0.4,
        headX: 0.1,
      }),
    },
    { at: m.share, pose: () => ({ ...holding(SIT), headX: -0.15 }) },
    { at: standUp, pose: () => holding(STAND) },
    { at: release - 0.5, pose: () => reachUp(STAND) },
    { at: release + 0.4, pose: (x) => wave(x, STAND) },
  ]);

  const face = track(now, [
    [0, "flat"],
    [m.hundred, "o"],
    [m.slow, "sad"],
    [m.tool, "flat"],
    [m.broke, "o"],
    [broke2 + 0.4, "sad"],
    [dawn + 0.2, "smile"],
    [m.smile, "grin"],
    [m.help, "smile"],
    [m.share + 1, "grin"],
  ] as [number, "flat" | "o" | "sad" | "smile" | "grin"][]);

  const typedChars = Math.floor(Math.max(0, now - m.tool) * 70);
  const screen: Screen = track<Screen>(now, [
    [0, { kind: "blank", caret: Math.floor(now * 2) % 2 === 0 }],
    [
      m.slow,
      {
        kind: "progress",
        pct: 0.4 + Math.max(0, now - m.slow) * 0.35,
        eta: ["ETA 2 min", "ETA 4 hours", "ETA 3 days", "ETA 7 years"][
          Math.min(3, Math.floor((now - m.slow) / 1.2))
        ],
      },
    ],
    [m.tool, { kind: "code", text: CODE.slice(0, typedChars) }],
    [m.broke, { kind: "error", n: 1 }],
    [m.broke + 0.45, { kind: "code", text: CODE }],
    [broke2, { kind: "error", n: 2 }],
    [dawn, { kind: "ok" }],
  ]);
  const screenKey = JSON.stringify(
    screen.kind === "progress" ? { ...screen, pct: Math.round(screen.pct * 10) } : screen,
  );

  const minutes =
    now < m.slow ? 47 + (now - at) * 0.4 : now < dawn ? 49 + (now - m.slow) * 90 : 9 * 60 + 12;
  const clock: [number, number] =
    now < dawn ? [3 + Math.floor(minutes / 60), minutes % 60] : [9, 12];
  const notes = now < m.hundred ? 0 : Math.min(64, Math.floor((now - m.hundred) * 22));
  const blow = seg(now, m.tool + 0.3, m.tool + 2.3);

  // Where the idea is: thought bubble, above his head, in a jar, out the window.
  const showBubble = now < m.tool;
  const inJar = now >= m.keep && now < standUp;
  const inHand = now >= standUp && now < release;
  const flying = now >= release;
  const fly = seg(now, release, m.end);
  const cheerCube = now >= m.smile && now < m.keep;

  const passer = seg(now, m.help, m.keep);

  return (
    <Scene3D env={0.4}>
      <Cam
        keys={upKeys(keys)}
        t={now}
        shake={
          (Math.max(0, 1 - (now - m.broke) * 3) * (now > m.broke ? 1 : 0) +
            Math.max(0, 1 - (now - broke2) * 3) * (now > broke2 ? 1 : 0)) *
          0.05
        }
      />
      <World
        t={now}
        time={1 - day * 0.92}
        lit={(h, w) => day < 0.5 && rand(h * 7 + w) > 0.85}
        heroLit={1}
      />
      <group position={[0, UP, 0]}>
        <Room
          t={now}
          screen={screen}
          screenKey={screenKey}
          day={day}
          notes={notes}
          blow={blow}
          mugs={Math.min(9, 3 + Math.floor((now - at) / 1.6))}
          clock={clock}
          windowOpen={seg(now, standUp + 0.3, standUp + 1.2)}
          lamp={1 - day * 0.8}
        />
        <HeroMan
          pose={pose}
          face={face}
          position={now >= standUp ? [0, 0, -1.5] : undefined}
          rotation={Math.PI}
          t={now}
          blink={Math.floor(now * 10) % 41 === 0}
          overHead={
            showBubble ? (
              <ThoughtBubble t={now} scale={0.75} />
            ) : cheerCube ? (
              <IdeaCube
                position={[0, 0.55 + Math.abs(Math.sin(now * 6)) * 0.12, 0]}
                size={0.22}
                t={now}
              />
            ) : undefined
          }
          inHands={
            inJar ? (
              <group position={[0, -0.05, -0.08]}>
                <Jar>
                  <IdeaCube size={0.14} t={now} glow={0.7} />
                </Jar>
              </group>
            ) : inHand ? (
              <IdeaCube size={0.2} t={now} />
            ) : undefined
          }
        />
        {now >= m.slow && now < m.tool && (
          <Snail position={[0.95 - seg(now, m.slow, m.tool) * 0.35, 0.755, -1.86]} t={now} />
        )}
        <Burst
          position={[0, 1.0, -2.1]}
          age={now - m.broke}
          colors={["#ffcf5a", "#ff7a59", "#fff"]}
          count={28}
          seed={3}
        />
        <Burst
          position={[0, 1.0, -2.1]}
          age={now - broke2}
          colors={["#ffcf5a", "#ff7a59", "#fff"]}
          count={36}
          seed={8}
        />
        <Burst position={[0, 2.2, -1.6]} age={now - m.smile} count={70} speed={3} life={2.2} />
        {flying && (
          <IdeaCube position={arc([0, 2.2, -2.2], [0, 1.0, -13], fly, 2.5)} size={0.24} t={now} />
        )}
      </group>
      {/* someone walks past outside, then looks up */}
      {passer > 0 && passer < 1 && (
        <Person
          pose={passer < 0.75 ? walk(now) : wave(now, STAND)}
          position={[-6 + Math.min(passer, 0.75) * 12, 0, -4.8]}
          rotation={passer < 0.75 ? Math.PI / 2 : Math.PI}
          look={TOWN[1]}
          face="smile"
        />
      )}
    </Scene3D>
  );
};
