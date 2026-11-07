import * as THREE from "three";
import { HueTown, HUE, NGO_MON, OFFICE, PLAZA } from "../three/hue";
import { Motorbike, TownLife } from "../three/hue-life";
import { HeroShell, HueHeroHome } from "../three/hue";
import { Moon, Sky, Stars, SynthSun } from "../three/props";
import type { CamKey } from "../three/stage";

// One world for the whole video: a small Huế in a ring of green hills. His
// street (road along x at z = -8) with his house at the origin, the
// riverside square, the Perfume River, the Citadel across it.
// `time` 0 = day, 0.5 = sunset, 1 = night.

/** His bedroom is on the first floor (one storey up). */
export const UP = 3.2;

const mix = (a: string, b: string, k: number) =>
  `#${new THREE.Color(a).lerp(new THREE.Color(b), k).getHexString()}`;
const tri = (day: string, sunset: string, night: string, time: number) =>
  time < 0.5 ? mix(day, sunset, time * 2) : mix(sunset, night, (time - 0.5) * 2);

export type WorldProps = {
  t: number;
  time: number;
  lit?: (house: number, window: number) => boolean;
  skipAcross?: (number | [number, number])[];
  heroLit?: number;
  /** Motorbikes on his street. */
  traffic?: boolean;
  /** Traffic on the riverside road. */
  river?: boolean;
  /** Vendors, cafés and walkers on his street. */
  people?: boolean;
  /** People on the square. */
  plaza?: boolean;
  lamps?: boolean;
};

export const World = ({
  t,
  time,
  lit = () => false,
  skipAcross = [],
  heroLit = 1,
  traffic = true,
  river = true,
  people = true,
  plaza = true,
  lamps = true,
}: WorldProps) => {
  const night = Math.max(0, (time - 0.5) * 2);
  const sunset = 1 - Math.abs(time - 0.5) * 2;
  const horizon = tri("#cfe8f0", "#f7a072", "#1c2a48", time);
  return (
    <>
      <Sky top={tri("#5fb8ff", "#5b3f8c", "#070d1d", time)} horizon={horizon} bottom={horizon} />
      {/* haze in the sky's own colour: the hills fade into it, no horizon line */}
      <fog attach="fog" args={[horizon, 110, 520]} />
      <Stars opacity={night} />
      <Moon position={[160, 170, -300]} opacity={night} />
      <SynthSun
        position={[-60, 175 - time * 130, -360]}
        size={200}
        phase={-t * 0.2}
        opacity={Math.max(0, 1 - night * 1.5) * (0.35 + sunset * 0.65)}
      />
      <hemisphereLight
        args={[tri("#ffffff", "#ffc8a0", "#6a7fb8", time), "#3a4a2a", 1.6 - night * 1.25]}
      />
      <directionalLight
        position={[-80, 90, -60]}
        intensity={2.4 - night * 2.1}
        color={tri("#fff4e0", "#ff9a6c", "#9fb4ff", time)}
      />
      <HueTown t={t} night={night} lit={lit} skipAcross={skipAcross} lamps={lamps} />
      <TownLife t={t} night={night} traffic={traffic} river={river} people={people} plaza={plaza} />
      <HueHeroHome lit={heroLit} night={night} />
      {/* his Honda, parked on the pavement */}
      <Motorbike
        position={[1.6, 0, -3.95]}
        rotation={-Math.PI / 2}
        color="#e63946"
        seed={1}
        t={0}
        rider={false}
      />
      <group position={[0, UP, 0]}>
        <HeroShell />
      </group>
    </>
  );
};

/** Camera keys written in room coordinates, lifted to his upstairs room. */
export const upKeys = (keys: CamKey[]): CamKey[] =>
  keys.map((k) => ({
    ...k,
    pos: [k.pos[0], k.pos[1] + UP, k.pos[2]],
    look: [k.look[0], k.look[1] + UP, k.look[2]],
  }));

export { HUE, NGO_MON, OFFICE, PLAZA };
