import { useMemo } from "react";
import { beatPulse } from "../lib/audio";
import { useLocal } from "../lib/motion";
import {
  cheer,
  holding,
  listening,
  Person,
  reachUp,
  STAND,
  talking,
  walk,
  wave,
  type Pose,
} from "../three/person";
import { Bubble, IdeaCube } from "../three/props";
import { arc, Cam, rand, Scene3D, seg, type CamKey, type V3 } from "../three/stage";
import { HeroMan, NEIGHBOR, TOWN } from "./cast";
import { World } from "./world";

// The chorus, out on the street: the idea is passed hand to hand, carried
// on, then two people simply talk about what each of them did with it,
// and at last the whole town lights up. Chorus 1 is on his street at
// golden hour; chorus 2 on the riverside square at dusk. `c` = the four
// line starts.

const SIDEWALK = -4.9;
const PASSERS = [-14, -10, -6, -2];
const MEET = 11;
const CHIEN_X = -17.4;
const STUDENTS = ["Võ Văn Duy", "Phạm Quốc Đạt", "Phát Lê", "Tuấn Kiệt"];

/** Where each chorus happens: his street, or the riverside square. */
const ORIGIN: Record<1 | 2, V3> = { 1: [0, 0, 0], 2: [0, 0, -46] };
// On the square the scene is mirrored in z, so the cameras look north over
// the river to the Citadel instead of at the backs of the houses.
const FLIP: Record<1 | 2, boolean> = { 1: false, 2: true };

const STORIES: Record<1 | 2, [string, string]> = {
  1: ["Chiến's bot wrote my jingle!", "I built one too: Pixel Cat!"],
  2: ["Mine sorted my receipts!", "Mine fixed my bug at 2 AM!"],
};

export const StreetChorus = ({
  at,
  c,
  end,
  variant,
}: {
  at: number;
  c: [number, number, number, number];
  end: number;
  variant: 1 | 2;
}) => {
  const { t } = useLocal();
  const now = at + t;
  const [c0, c1, c2, c3] = c;
  const O = ORIGIN[variant];
  const flip = FLIP[variant];
  const o = (p: V3): V3 => [p[0] + O[0], p[1] + O[1], O[2] + (flip ? -p[2] : p[2])];
  const bubbleYaw = flip ? 0 : Math.PI;

  // Hand-offs: the cube drops into the first pair of hands, then hops along.
  const land = c0 + 0.2;
  const passes = [c0 + 1.3, c0 + 2.5, c0 + 3.6];
  const hand = (x: number): V3 => [x + 0.32, 1.02, SIDEWALK + 0.25];
  let holder = -1;
  // Chiến made it: he hands it to Duy, the first student walking by.
  const chienHand: V3 = [CHIEN_X + 0.4, 1.02, SIDEWALK + 0.25];
  let cube: V3 = arc(chienHand, hand(PASSERS[0]), seg(now, c0 - 0.35, land), 0.6);
  if (now >= land) holder = 0;
  passes.forEach((p, i) => {
    if (now >= p) holder = i + 1;
    if (now >= p - 0.55 && now < p)
      cube = arc(hand(PASSERS[i]), hand(PASSERS[i + 1]), (now - (p - 0.55)) / 0.55, 1.4);
  });
  if (now >= land && !passes.some((p) => now >= p - 0.55 && now < p)) cube = hand(PASSERS[holder]);

  // The last one carries it on down the street, and meets a friend.
  const carrying = now >= c1 + 0.3;
  const walkK = seg(now, c1 + 0.3, c2 - 0.2);
  const carrierX = -2 + walkK * (MEET - 1 - -2);
  const talk = now >= c2 - 0.2 && now < c3;
  const speaker = now < c2 + (c3 - c2) / 2 ? 0 : 1;

  const glow = seg(now, c3 + 0.3, c3 + 3.5);
  const time = variant === 1 ? 0.3 + glow * 0.65 : 0.55 + glow * 0.45;

  const lanterns = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) =>
        variant === 1
          ? {
              x: (rand(i) - 0.5) * 100,
              y: 6,
              z: rand(i + 7) > 0.5 ? 2 + rand(i + 3) * 2 : -17 + rand(i + 9) * 2,
              delay: rand(i + 21) * 2.5,
            }
          : {
              // lanterns over the Perfume River
              x: (rand(i) - 0.5) * 110,
              y: 1 + rand(i + 2) * 6,
              z: -58 - rand(i + 7) * 34,
              delay: rand(i + 21) * 2.5,
            },
      ),
    [variant],
  );

  const cut = (time: number, pos: V3, look: V3, fov = 42): CamKey[] => [
    { t: time - 0.001, pos: o(pos), look: o(look), fov },
    { t: time, pos: o(pos), look: o(look), fov },
  ];
  const follow = Math.max(-12, Math.min(2, cube[0]));
  const keys: CamKey[] = [
    { t: at, pos: o([-15.6, 5, -14]), look: o([-15.6, 2, -5]), fov: 44 },
    { t: land, pos: o([-15.2, 1.9, -10.8]), look: o([-15.2, 1.1, -5]), fov: 46 },
    { t: c0 + 1.3, pos: o([-11, 1.9, -10.5]), look: o([-11, 1.1, -5]), fov: 38 },
    { t: c1 - 0.05, pos: o([follow, 1.9, -10.5]), look: o([follow, 1.1, -5]), fov: 38 },
    ...cut(c1, [1.6, 1.5, -6.6], [-1.5, 1.2, -4.9], 45),
    { t: c2 - 0.25, pos: o([MEET + 1.5, 1.5, -6.8]), look: o([MEET - 2, 1.2, -4.9]), fov: 45 },
    // they talk: a plain two-shot, nothing fancy
    ...cut(c2 - 0.2, [MEET + 0.1, 1.5, -9.4], [MEET + 0.1, 1.45, -4.9], 44),
    { t: c3 - 0.05, pos: o([MEET + 0.1, 1.45, -8.4]), look: o([MEET + 0.1, 1.45, -4.9]), fov: 42 },
    ...cut(
      c3,
      variant === 1 ? [24, 1.6, -7.6] : [24, 1.6, -11],
      variant === 1 ? [0, 5, -6.5] : [0, 6, 40],
      50,
    ),
    {
      t: c3 + 2.5,
      pos: o(variant === 1 ? [16, 6, -10] : [16, 10, -14]),
      look: o(variant === 1 ? [0, 6, -6] : [0, 8, 45]),
      fov: 50,
    },
    {
      t: end,
      pos: variant === 1 ? [0, 30, -42] : [26, 24, -14],
      look: variant === 1 ? [0, 4, -4] : [0, 6, -80],
      fov: 52,
    },
  ];

  const passerPose = (i: number, x: number): Pose => {
    if (i === holder && !(i === 3 && carrying)) return holding(STAND);
    if (i < holder) return i % 2 ? wave(x + i, STAND) : cheer(x + i);
    if (passes[i - 1] !== undefined && now > passes[i - 1] - 0.7 && now < passes[i - 1])
      return reachUp(STAND);
    return { ...STAND, headY: -0.3 };
  };
  const [lineA, lineB] = STORIES[variant];

  return (
    <Scene3D env={variant === 1 ? 0.55 - glow * 0.35 : 0.3}>
      <Cam keys={keys} t={now} />
      <World
        t={now}
        time={time}
        traffic={false}
        plaza={variant === 1}
        lit={(h, w) => glow > 0 && rand(h * 5 + w) < glow * 1.2 - Math.abs(h - 10) * 0.03}
      />
      <group position={O} scale={[1, 1, flip ? -1 : 1]}>
        {/* the line of people passing it on */}
        {PASSERS.map((x, i) =>
          i === 3 && carrying ? null : (
            <Person
              key={i}
              pose={passerPose(i, now)}
              position={[x, 0, SIDEWALK]}
              rotation={i < holder ? Math.PI : Math.PI / 2}
              look={{ ...TOWN[i % TOWN.length], shirt: "#ffffff", pants: "#1d3557" }}
              name={STUDENTS[i]}
              face={i === holder ? "grin" : i < holder ? "laugh" : "o"}
              t={now + i}
              gaze={i === holder ? [0, -0.6] : [0.6, 0.2]}
              blink={Math.floor(now * 10 + i * 3) % 29 === 0}
            />
          ),
        )}
        {/* the carrier walks on, then stops to talk */}
        {carrying && (
          <Person
            pose={
              talk ? (speaker === 0 ? talking(now, holding(STAND)) : listening(now)) : walk(now)
            }
            position={[talk ? MEET - 0.55 : carrierX, 0, SIDEWALK]}
            rotation={talk ? Math.PI / 2 + 0.55 : Math.PI / 2}
            look={{ ...TOWN[3], shirt: "#ffffff", pants: "#1d3557" }}
            name={STUDENTS[3]}
            face={talk ? (speaker === 0 ? "talk" : "laugh") : "grin"}
            t={now}
            gaze={talk ? [0.8, 0] : [0, 0]}
            inHands={
              !talk || speaker === 0 ? <IdeaCube size={0.2} t={now} light={false} /> : undefined
            }
          />
        )}
        <Person
          pose={
            talk
              ? speaker === 1
                ? talking(now, STAND, 2)
                : listening(now)
              : now > c2 - 1.2
                ? wave(now, STAND)
                : STAND
          }
          position={[MEET + 0.55, 0, SIDEWALK]}
          rotation={talk ? -Math.PI / 2 - 0.55 : -Math.PI / 2}
          look={variant === 1 ? NEIGHBOR : TOWN[5]}
          name="Khánh Quân"
          face={talk ? (speaker === 1 ? "talk" : "laugh") : "smile"}
          t={now + 1}
          gaze={talk ? [-0.8, 0] : [0, 0]}
          inHands={
            talk && speaker === 1 ? <IdeaCube size={0.2} t={now + 1} light={false} /> : undefined
          }
        />
        {!carrying && <IdeaCube position={cube} size={0.22} t={now} />}
        <HeroMan
          position={[CHIEN_X, 0, SIDEWALK]}
          rotation={Math.PI / 2}
          pose={
            now < c0 - 0.35 ? holding(STAND) : now < land + 0.4 ? reachUp(STAND) : wave(now, STAND)
          }
          face={now < land ? "grin" : "laugh"}
          t={now}
          name="Võ Quang Chiến"
        />
      </group>

      {talk && (
        <>
          <Bubble
            position={o([MEET - 1.0, 2.3, SIDEWALK - 0.3])}
            rotation={bubbleYaw}
            lines={[lineA]}
            w={2.7}
            h={0.7}
            scale={seg(now, c2, c2 + 0.25) * (speaker === 0 ? 1 : 0.75)}
          />
          <Bubble
            position={o([MEET + 1.1, 2.45, SIDEWALK - 0.3])}
            rotation={bubbleYaw}
            lines={[lineB]}
            w={2.7}
            h={0.7}
            accent
            scale={seg(now, c2 + (c3 - c2) / 2, c2 + (c3 - c2) / 2 + 0.25)}
          />
        </>
      )}
      {/* what a little idea can do: lanterns rise all over town */}
      {lanterns.map((l, i) => {
        const k = now - (c3 + 0.4 + l.delay);
        if (k < 0) return null;
        return (
          <IdeaCube
            key={i}
            light={false}
            position={[l.x + Math.sin(k + i) * 0.6, l.y + k * 2.6, l.z]}
            size={variant === 1 ? 0.5 : 1.2}
            t={now + i}
            glow={1 + beatPulse(now) * 0.5}
          />
        );
      })}
    </Scene3D>
  );
};
