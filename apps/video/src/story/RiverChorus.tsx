import { useMemo } from "react";
import { beatPulse } from "../lib/audio";
import { useLocal } from "../lib/motion";
import { HUE } from "../three/hue";
import { Motorbike } from "../three/hue-life";
import {
  cheer,
  holding,
  listening,
  Person,
  reachUp,
  SIT,
  STAND,
  talking,
  walk,
  wave,
  type Look,
  type Pose,
} from "../three/person";
import { Bubble, IdeaCube } from "../three/props";
import { arc, Cam, rand, Scene3D, seg, type CamKey, type V3 } from "../three/stage";
import { HeroMan } from "./cast";
import { World } from "./world";

// Chorus 2, by the Perfume River at dusk, told differently from chorus 1:
// "I made something, passed it on": Chiến tosses the idea to the girl on
// the back of a passing motorbike.
// "Someone picked it up and carried on": the bike rides off along the
// river road with the idea held high.
// "You found a way, I found one too": she hops off and two friends talk.
// "That's what a little idea can do": lanterns rise over the river.

const LANE = HUE.riverRoad - 1; // the eastbound lane
const STOP_X = 33.5;
const TALK: [number, number] = [29.6, 30.7];
const TALK_Z = -26.3;
const CHIEN: V3 = [-4, 0, -26.1];

const UNI_WHITE: Look = { shirt: "#ffffff", pants: "#1d3557" };
const NHU: Look = {
  skin: "#f5d3b5",
  shirt: "#ff7aa2",
  pants: "#2b3445",
  hair: "#1a1410",
  hairStyle: "long",
  hat: "helmet",
  hatColor: "#ffd166",
};
const NHU_ON_FOOT: Look = { ...NHU, hat: "none" };
const THU: Look = {
  skin: "#f2c9a0",
  ...UNI_WHITE,
  pants: "#ffffff",
  hair: "#111",
  hairStyle: "long",
  hat: "conical",
};
const PHUOC: Look = {
  skin: "#c68a5e",
  shirt: "#2a9d8f",
  pants: "#3a4250",
  hair: "#111",
  hat: "helmet",
  hatColor: "#3a86ff",
};
const HAI: Look = {
  skin: "#e0a77f",
  shirt: "#8f6bd1",
  pants: "#2b3445",
  hair: "#2b1d14",
  hairStyle: "spiky",
  glasses: true,
};

export const RiverChorus = ({
  at,
  c,
  end,
}: {
  at: number;
  c: [number, number, number, number];
  end: number;
}) => {
  const { t } = useLocal();
  const now = at + t;
  const [c0, c1, c2, c3] = c;

  // The bike: rides in, passes Chiến at `pass`, rides on, stops by the café.
  const pass = c0 + 1.3;
  const stopAt = c2 - 0.5;
  const speed = 6;
  const ride = (time: number) => {
    if (time <= pass) return CHIEN[0] + (time - pass) * speed;
    // ease out from full speed to a stop at STOP_X
    const k = seg(time, pass, stopAt);
    const lin = CHIEN[0] + (STOP_X - CHIEN[0]) * Math.min(1, (time - pass) / (stopAt - pass));
    return lin * 0.35 + (CHIEN[0] + (STOP_X - CHIEN[0]) * k) * 0.65;
  };
  const bx = ride(now);
  const hopped = now >= c2 - 0.2;
  // After the hop she walks from the bike to the café, where Minh Thư waits.
  const walkIn = seg(now, c2 - 0.2, c2 + 0.55);
  const nhuPos: V3 = [
    STOP_X - 0.6 + (TALK[0] - (STOP_X - 0.6)) * walkIn,
    0,
    LANE - 0.8 + (TALK_Z - (LANE - 0.8)) * walkIn,
  ];
  const walking = hopped && walkIn < 1;

  // The idea: in Chiến's hands, tossed onto the bike, held up all the way.
  const chienHands: V3 = [CHIEN[0], 1.02, CHIEN[2] + 0.35];
  const held = (x: number): V3 => [x - 0.5, 2.05, LANE];
  const tossFrom = pass - 0.55;
  let cube: V3 | null = chienHands;
  if (now >= tossFrom) cube = arc(chienHands, held(ride(pass)), seg(now, tossFrom, pass), 1.2);
  if (now >= pass) cube = held(bx);
  if (hopped) cube = null; // she carries it in her hands from here
  const rise = seg(now, c3 + 0.2, c3 + 2.6);

  const glow = seg(now, c3 + 0.3, c3 + 3.5);
  const time = 0.58 + glow * 0.4;

  // Cameras.
  const keys: CamKey[] = [
    { t: at, pos: [-0.5, 1.8, -21.4], look: [-4.6, 1.2, -26.5], fov: 46 },
    { t: pass - 0.1, pos: [-1.2, 1.7, -21.6], look: [-4.2, 1.3, -25.5], fov: 44 },
    { t: c1 - 0.601, pos: [-1.6, 1.7, -21.8], look: [-3.8, 1.3, -25.5], fov: 44 },
  ];
  // chase the bike along the river road
  for (let time = c1 - 0.6; time <= stopAt + 0.4; time += 0.25) {
    const x = ride(time);
    keys.push({
      t: time,
      pos: [x - 6.5, 2.3, LANE + 1.4],
      look: [x + 5, 1.4, LANE - 0.6],
      fov: 50,
    });
  }
  const mid = c2 + (c3 - c2) / 2;
  const twoShot = (TALK[0] + TALK[1]) / 2;
  keys.push(
    {
      t: c2 - 0.201,
      pos: [ride(c2 - 0.2) - 6, 2.3, LANE + 1.4],
      look: [STOP_X, 1.4, LANE],
      fov: 50,
    },
    { t: c2 - 0.2, pos: [twoShot, 1.5, -22.3], look: [twoShot, 1.45, TALK_Z], fov: 44 },
    { t: c3 - 0.05, pos: [twoShot, 1.6, -21.6], look: [twoShot, 1.6, TALK_Z], fov: 46 },
    { t: c3, pos: [24, 1.7, -27.5], look: [6, 7, -80], fov: 52 },
    { t: c3 + 2.5, pos: [18, 8, -26], look: [0, 8, -85], fov: 52 },
    { t: end, pos: [26, 24, -14], look: [0, 6, -80], fov: 52 },
  );

  const speaker = now < mid ? 0 : 1;
  const passengerPose: Pose =
    now < pass - 0.6
      ? { ...SIT, headY: 0.6 }
      : now < pass
        ? { ...reachUp(SIT), headY: 0.5 }
        : { ...reachUp(SIT), rSh: [-2.9, 0.1], rEl: 0, headY: 0.2 };

  const lanterns = useMemo(
    () =>
      Array.from({ length: 50 }, (_, i) => ({
        x: (rand(i) - 0.5) * 110,
        y: 1 + rand(i + 2) * 6,
        z: -58 - rand(i + 7) * 34,
        delay: rand(i + 21) * 2.5,
      })),
    [],
  );

  return (
    <Scene3D env={0.3}>
      <Cam keys={keys} t={now} />
      <World
        t={now}
        time={time}
        traffic={false}
        river={false}
        lit={(h, w) => glow > 0 && rand(h * 5 + w) < glow * 1.2}
      />
      {/* Chiến and Hải on the edge of the square */}
      <HeroMan
        position={CHIEN}
        rotation={0}
        pose={
          now < tossFrom ? holding(STAND) : now < pass + 0.5 ? reachUp(STAND) : wave(now, STAND)
        }
        face={now < pass ? "grin" : "laugh"}
        t={now}
        name="Võ Quang Chiến"
        gaze={[0.6, 0.2]}
      />
      <Person
        pose={now < pass ? { ...STAND, headY: -0.5 } : cheer(now + 0.3)}
        position={[CHIEN[0] - 1.2, 0, CHIEN[2]]}
        rotation={0.2}
        look={HAI}
        face={now < pass ? "o" : "laugh"}
        t={now}
        name="Nguyễn Văn Hải"
      />
      {/* the motorbike: Phước rides, Quỳnh Như on the back */}
      <Motorbike
        position={[bx, 0, LANE]}
        rotation={Math.PI / 2}
        color="#e63946"
        seed={3}
        t={now}
        night={glow}
        passenger={!hopped}
        riderLook={PHUOC}
        riderName={now > c1 - 0.6 && now < c2 ? "Trần Minh Phước" : undefined}
        passengerLook={NHU}
        passengerName={now < c1 - 0.6 ? "Quỳnh Như" : undefined}
        passengerPose={passengerPose}
        sideSaddle
      />
      {cube && <IdeaCube position={cube} size={0.24} t={now} />}
      {/* the talk by the café */}
      {hopped && (
        <Person
          pose={
            walking ? walk(now, 1.3) : speaker === 0 ? talking(now, holding(STAND)) : listening(now)
          }
          position={nhuPos}
          rotation={walking ? -2.0 : Math.PI / 2 - 0.55}
          look={NHU_ON_FOOT}
          face={speaker === 0 ? "talk" : "laugh"}
          t={now}
          name={now < c2 + 0.9 ? "Quỳnh Như" : undefined}
          inHands={rise === 0 ? <IdeaCube size={0.2} t={now} light={false} /> : undefined}
        />
      )}
      <Person
        pose={
          hopped
            ? speaker === 1
              ? talking(now, STAND, 2)
              : listening(now)
            : now > c1 + 2
              ? wave(now, STAND)
              : STAND
        }
        position={[TALK[1], 0, TALK_Z]}
        rotation={-Math.PI / 2 + 0.55}
        look={THU}
        face={hopped ? (speaker === 1 ? "talk" : "laugh") : "smile"}
        t={now + 1}
        name={now > c1 && now < c2 + 0.9 ? "Minh Thư" : undefined}
      />
      {hopped && now < c3 && (
        <>
          <Bubble
            position={[TALK[0] - 0.55, 2.15, TALK_Z + 0.4]}
            lines={["Nhật Đoàn's bot fixed my bug!"]}
            w={2.6}
            h={0.6}
            scale={seg(now, c2 + 0.6, c2 + 0.85) * (speaker === 0 ? 1 : 0.75)}
          />
          <Bubble
            position={[TALK[1] + 0.55, 2.3, TALK_Z + 0.4]}
            lines={["Toàn Lê's bot did my receipts!"]}
            w={2.6}
            h={0.6}
            accent
            scale={seg(now, mid, mid + 0.25)}
          />
        </>
      )}
      {rise > 0 && (
        <IdeaCube
          position={arc([TALK[0] + 0.3, 1.2, TALK_Z], [10, 14, -72], rise, 3)}
          size={0.3 + rise * 0.6}
          t={now}
        />
      )}
      {/* what a little idea can do: lanterns over the Perfume River */}
      {lanterns.map((l, i) => {
        const k = now - (c3 + 0.4 + l.delay);
        if (k < 0) return null;
        return (
          <IdeaCube
            key={i}
            light={false}
            position={[l.x + Math.sin(k + i) * 0.6, l.y + k * 2.6, l.z]}
            size={1.2}
            t={now + i}
            glow={1 + beatPulse(now) * 0.5}
          />
        );
      })}
    </Scene3D>
  );
};
