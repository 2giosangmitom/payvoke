import { AbsoluteFill } from "remotion";
import { pop, ramp, useLocal } from "../lib/motion";
import { sans, T } from "../lib/theme";
import { Logo } from "../ui/kit";
import {
  headInHands,
  listening,
  mixPose,
  Person,
  SIT,
  STAND,
  talking,
  walk,
  type Look,
  type Pose,
} from "../three/person";
import { Room, ThoughtBubble } from "../three/props";
import { Cam, rand, Scene3D, seg, type CamKey } from "../three/stage";
import { HeroMan, TOWN } from "./cast";
import { FamilyOutside } from "./family";
import { UP, World } from "./world";

// 0:00 to the second line: a beat-cut montage of Huế at sunset (the square,
// the Perfume River and its bridge, Thiên Mụ pagoda, the riverside traffic)
// down to his street at night and his one lit window. The titles say what
// Payvoke is.

const cut = (at: number, from: Omit<CamKey, "t">, to: Omit<CamKey, "t">, len: number): CamKey[] => [
  { ...from, t: at },
  { ...to, t: at + len - 0.002 },
];

const TEACHER = (shirt: string, hair: string, style: Look["hairStyle"], glasses = false): Look => ({
  skin: "#f2c9a0",
  shirt,
  pants: "#2b3445",
  hair,
  hairStyle: style,
  glasses,
});
const STUDENT_BOY: Look = { skin: "#e0a77f", shirt: "#ffffff", pants: "#1d3557", hair: "#111" };
const AO_DAI: Look = {
  skin: "#f5d3b5",
  shirt: "#ffffff",
  pants: "#ffffff",
  hair: "#111",
  hairStyle: "long",
  hat: "conical",
};

/** Đống Đa at the end of the school day: named teachers and students. */
const DongDaPeople = ({ t }: { t: number }) => {
  const chat = (k: number): Pose => talking(t + k, STAND, k);
  const walkers: [string, Look, number][] = [
    ["Huyền Trang", AO_DAI, 0],
    ["Quang Huy", STUDENT_BOY, 1.1],
    ["Nhật Huy", { ...STUDENT_BOY, skin: "#c68a5e", hairStyle: "spiky" }, 2.0],
  ];
  return (
    <>
      {/* Cao Thắng: two maths teachers and the physics teacher */}
      <Person
        pose={chat(0)}
        position={[24.4, 0, 26.0]}
        rotation={-1.0}
        look={TEACHER("#ffffff", "#2b1d14", "short", true)}
        face="talk"
        t={t}
      />
      <Person
        pose={listening(t)}
        position={[26.2, 0, 26.2]}
        rotation={-1.2}
        look={TEACHER("#e88aa8", "#111", "long")}
        face="smile"
        t={t}
        tagLift={0.3}
      />
      <Person
        pose={chat(2)}
        position={[28.0, 0, 25.9]}
        rotation={-1.4}
        look={TEACHER("#9fb4c8", "#3b2a1f", "short", true)}
        face="laugh"
        t={t}
      />
      {walkers.map(([name, look, k]) => (
        <Person
          key={name}
          pose={walk(t + k, 0.9)}
          position={[22 - seg(t, 11.5, 15.6) * 7 + k * 1.2, 0, 26.0 + (k % 2) * 0.4]}
          rotation={-Math.PI / 2}
          look={look}
          face="smile"
          t={t}
          name={name}
        />
      ))}
      {/* ĐH Khoa học: two lecturers at the gate */}
      <Person
        pose={chat(1)}
        position={[12.5, 0, 38.6]}
        rotation={-2.4}
        look={TEACHER("#3f7d63", "#2b1d14", "short", true)}
        face="talk"
        t={t}
      />
      <Person
        pose={listening(t)}
        position={[14.6, 0, 38.7]}
        rotation={-2.3}
        look={TEACHER("#c3b1e1", "#111", "bun")}
        face="smile"
        t={t}
        tagLift={0.3}
      />
      <Person
        pose={listening(t + 0)}
        position={[10.2, 0, 38.9]}
        rotation={-2.6}
        look={TEACHER("#f4a6b8", "#1a1410", "long", true)}
        face="smile"
        t={t}
        tagLift={0}
      />
    </>
  );
};

export const IntroScene = ({ stuckAt }: { stuckAt: number }) => {
  const { t, dur } = useLocal();
  const keys: CamKey[] = [
    // over his street's rooftops, across the square and river to the Citadel
    ...cut(
      0,
      { pos: [-6, 24, 14], look: [0, 6, -110], fov: 50 },
      { pos: [4, 20, 0], look: [0, 7, -110], fov: 48 },
      6,
    ),
    // low along the Perfume River toward Trường Tiền bridge
    ...cut(
      6,
      { pos: [-50, 6, -64], look: [45, 3, -76], fov: 52 },
      { pos: [8, 4.5, -68], look: [45, 3, -78], fov: 50 },
      6,
    ),
    // Đống Đa after school, slowly, so every name can be read: teachers
    // and students at Cao Thắng's gate...
    ...cut(
      12,
      { pos: [19, 1.7, 35.2], look: [27.5, 2.0, 25.6], fov: 50 },
      { pos: [20.2, 1.7, 35.0], look: [28.0, 2.0, 25.6], fov: 48 },
      3.4,
    ),
    // ...and the lecturers at ĐH Khoa học's, across the road
    ...cut(
      15.4,
      { pos: [7.5, 1.7, 31.0], look: [13.3, 2.2, 39.5], fov: 46 },
      { pos: [8.5, 1.7, 31.2], look: [13.5, 2.2, 39.5], fov: 44 },
      3.4,
    ),
    // across the river, past the flag tower to the Noon Gate
    ...cut(
      18.8,
      { pos: [-54, 12, -70], look: [-24, 13, -112], fov: 52 },
      { pos: [-12, 10, -76], look: [0, 11, -128], fov: 50 },
      5.4,
    ),
    ...cut(
      24.2,
      { pos: [-44, 2.6, -9], look: [-30, 2.6, -9], fov: 50 },
      { pos: [-12, 2.8, -9.5], look: [6, 3, -6], fov: 50 },
      7.8,
    ),
    ...cut(
      32,
      { pos: [14, 4.2, -12.3], look: [0, 4.6, -2.6], fov: 45 },
      { pos: [0, 5.6, -10.5], look: [0, 4.95, -2.6], fov: 42 },
      stuckAt - 32,
    ),
    { t: stuckAt, pos: [0, 5.35, -5.6], look: [0, 4.95, -2.5], fov: 38 },
    { t: dur, pos: [0, 5.25, -4.5], look: [0, 4.95, -2.3], fov: 36 },
  ];

  // Sunset over downtown, night by the time we reach his street.
  const time = 0.5 + seg(t, 16, 26) * 0.5;
  // Everyone else goes to bed; his window stays lit.
  const lit = (house: number, w: number) => t < 24 + rand(house * 13 + w) * 9;
  const stuck = seg(t, stuckAt - 2.5, stuckAt);
  const pose: Pose = mixPose(
    headInHands(t),
    {
      ...SIT,
      lean: 0.1,
      headX: -0.25,
      headZ: Math.sin(t * 2) * 0.1,
      lSh: [-0.5, 0.2],
      rSh: [-0.5, 0.2],
      lEl: -1,
      rEl: -1,
    },
    stuck,
  );
  const jog = seg(t, 24.2, 32);

  return (
    <AbsoluteFill>
      <Scene3D env={0.5}>
        <Cam keys={keys} t={t} />
        <World t={t} time={time} lit={lit} traffic={t < 24 || t > 32} />
        {t > 11.5 && t < 19 && <DongDaPeople t={t} />}
        {t > 24 && t < stuckAt && <FamilyOutside t={t} names={t > 26.5} />}
        {/* a late jogger with headphones, the only other one awake */}
        {jog > 0 && jog < 1 && (
          <Person
            pose={walk(t, 1.6)}
            position={[-34 + jog * 40, 0, -6.3]}
            rotation={Math.PI / 2}
            look={{ ...TOWN[4], hat: "cap", hatColor: "#ff7a59" }}
            face="smile"
            t={t}
          />
        )}
        <group position={[0, UP, 0]}>
          <Room
            t={t}
            closed
            screen={{ kind: "blank", caret: Math.floor(t * 2) % 2 === 0 }}
            screenKey={`blank-${Math.floor(t * 2) % 2}`}
            mugs={3}
          />
          <HeroMan
            pose={pose}
            face={stuck > 0.5 ? "flat" : "sad"}
            t={t}
            blink={Math.floor(t * 10) % 37 === 0}
            name={t >= 32 && t < stuckAt - 2.6 ? "Võ Quang Chiến" : undefined}
            overHead={stuck > 0.01 ? <ThoughtBubble t={t} scale={stuck * 0.75} /> : undefined}
          />
        </group>
      </Scene3D>
      <Credits t={t} />
    </AbsoluteFill>
  );
};

const LOWER_THIRDS: [number, number, string, string][] = [
  [6.4, 11.6, "Chat with any AI agent", "free, for as long as you like"],
  [12.3, 15.2, "It makes you an offer", "with a price and a deadline"],
  [15.6, 18.6, "Accept it and pay for that job", "over x402, held until the work is done"],
  [19.2, 23.8, "Delivered on time, the builder is paid", "late or failed, you get your money back"],
  [25.2, 31, "Anyone can share an agent", "and get paid for each job it does"],
  [33, 39, "This is the story of Võ Quang Chiến", "and one little idea"],
];

const Credits = ({ t }: { t: number }) => {
  const { frame, fps } = useLocal();
  const title = pop(frame, fps, 0.6, 14) * (1 - ramp(t, 5.3, 6));
  const third = LOWER_THIRDS.find(([a, b]) => t >= a && t < b);
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 140,
          gap: 22,
          opacity: title,
          scale: 0.92 + title * 0.08,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <Logo size={150} style={{ filter: "drop-shadow(0 8px 40px #0009)" }} />
          <span
            style={{
              fontSize: 190,
              fontWeight: 800,
              letterSpacing: "-0.06em",
              lineHeight: 1,
              background: `linear-gradient(180deg, #ffffff 10%, ${T.logoLight} 55%, ${T.sunset} 100%)`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              filter: "drop-shadow(0 8px 40px #0009)",
            }}
          >
            Payvoke
          </span>
        </div>
        <span
          style={{
            fontSize: 46,
            fontWeight: 600,
            color: "#fff",
            letterSpacing: "-0.02em",
            textShadow: "0 2px 24px #000",
          }}
        >
          a marketplace where AI agents get hired, one job at a time
        </span>
        <span style={{ fontSize: 32, color: "#fff", textShadow: "0 2px 6px #000, 0 0 28px #000" }}>
          paid per job over x402, on Avalanche
        </span>
      </AbsoluteFill>
      {third && (
        <div
          style={{
            position: "absolute",
            left: 110,
            bottom: 120,
            display: "grid",
            gap: 6,
            opacity: Math.min(
              ramp(t, third[0], third[0] + 0.3),
              1 - ramp(t, third[1] - 0.3, third[1]),
            ),
            translate: `${(1 - ramp(t, third[0], third[0] + 0.4)) * -40}px 0`,
            textShadow: "0 2px 20px #000",
          }}
        >
          <span style={{ fontSize: 30, color: T.logoLight }}>{third[2]}</span>
          <span style={{ fontSize: 64, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>
            {third[3]}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
};
