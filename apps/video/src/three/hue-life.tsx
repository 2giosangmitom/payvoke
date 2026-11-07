import type { ReactNode } from "react";
import { HUE } from "./hue";
import { Person, SIT, STAND, talking, walk, type Look, type Pose } from "./person";
import { rand, type V3 } from "./stage";

// People and traffic in the little Huế: motorbikes everywhere, a cyclo,
// street vendors with shoulder poles and cone hats, plastic-stool cafés on
// the sidewalk, old men at chess on the square, dragon boats on the river.

const SKIN = ["#f2c9a0", "#e0a77f", "#c68a5e", "#f5d3b5", "#d9a07a", "#a8714d"];
const SHIRTS = [
  "#ffffff",
  "#e63946",
  "#2a9d8f",
  "#f4a261",
  "#457b9d",
  "#ffd166",
  "#8f6bd1",
  "#06d6a0",
  "#ef476f",
  "#3a86ff",
];
const PANTS = ["#2b3445", "#3a4250", "#5a4030", "#1b2533", "#6b705c", "#22324a"];

/** A townsperson's look from a seed, with Vietnamese hats now and then. */
export function local(seed: number, hat?: Look["hat"]): Look {
  const r = (k: number) => rand(seed * 9.1 + k);
  const style = (["short", "long", "ponytail", "bun", "short", "spiky"] as const)[
    Math.floor(r(1) * 6)
  ];
  return {
    skin: SKIN[Math.floor(r(2) * SKIN.length)],
    shirt: SHIRTS[Math.floor(r(3) * SHIRTS.length)],
    pants: PANTS[Math.floor(r(4) * PANTS.length)],
    hair: r(5) > 0.85 ? "#d9d9d9" : "#1a1410",
    hairStyle: style,
    hat: hat ?? (r(6) > 0.6 ? "conical" : "none"),
    hatColor:
      hat === "helmet"
        ? ["#e63946", "#ffd166", "#3a86ff", "#ffffff", "#06d6a0", "#ff7aa2"][Math.floor(r(7) * 6)]
        : undefined,
    glasses: r(8) > 0.85,
  };
}

/** Riding: seated, hands forward on the bars. */
const RIDE: Pose = {
  ...SIT,
  lean: 0.12,
  lSh: [-1.1, 0.25],
  rSh: [-1.1, 0.25],
  lEl: -0.35,
  rEl: -0.35,
};
const PILLION: Pose = {
  ...SIT,
  lean: 0.05,
  lSh: [-0.3, 0.2],
  rSh: [-0.3, 0.2],
  lEl: -0.9,
  rEl: -0.9,
};

/** A scooter, facing +z, with a rider and sometimes a passenger. */
export const Motorbike = ({
  position,
  rotation = 0,
  color,
  seed,
  t,
  passenger,
  cargo,
  night = 0,
  riderName,
  riderLook,
  passengerName,
  passengerLook,
  passengerPose,
  passengerHands,
  rider = true,
  sideSaddle = false,
}: {
  position: V3;
  rotation?: number;
  color: string;
  seed: number;
  t: number;
  passenger?: boolean;
  cargo?: ReactNode;
  night?: number;
  riderName?: string;
  riderLook?: Look;
  passengerName?: string;
  passengerLook?: Look;
  passengerPose?: Pose;
  passengerHands?: ReactNode;
  rider?: boolean;
  /** The passenger sits sideways, facing the bike's left (local -x). */
  sideSaddle?: boolean;
}) => (
  <group position={position} rotation={[0, rotation, 0]}>
    {[-0.62, 0.6].map((z) => (
      <mesh key={z} position={[0, 0.27, z]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.22, 0.07, 8, 16]} />
        <meshStandardMaterial color="#151515" />
      </mesh>
    ))}
    <mesh position={[0, 0.5, -0.15]}>
      <boxGeometry args={[0.36, 0.34, 1.0]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.35} />
    </mesh>
    <mesh position={[0, 0.74, -0.25]}>
      <boxGeometry args={[0.34, 0.1, 0.75]} />
      <meshStandardMaterial color="#1d1d1d" />
    </mesh>
    <mesh position={[0, 0.72, 0.5]} rotation={[0.35, 0, 0]}>
      <boxGeometry args={[0.36, 0.75, 0.16]} />
      <meshStandardMaterial color={color} metalness={0.3} roughness={0.35} />
    </mesh>
    <mesh position={[0, 1.1, 0.42]}>
      <boxGeometry args={[0.66, 0.05, 0.05]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
    <mesh position={[0, 1.0, 0.62]}>
      <sphereGeometry args={[0.07, 8, 6]} />
      <meshBasicMaterial color={night > 0.4 ? "#fff6d0" : "#d9d4c0"} toneMapped={false} />
    </mesh>
    <mesh position={[0, 0.6, -0.78]}>
      <boxGeometry args={[0.18, 0.06, 0.04]} />
      <meshBasicMaterial color="#ff3a3a" toneMapped={false} />
    </mesh>
    {rider && (
      <Person
        pose={RIDE}
        position={[0, 0.3, -0.05]}
        look={riderLook ?? local(seed, "helmet")}
        face={seed % 3 ? "flat" : "smile"}
        t={t}
        shadow={false}
        name={riderName}
        tagLift={0.35}
      />
    )}
    {passenger && (
      <Person
        pose={passengerPose ?? PILLION}
        position={sideSaddle ? [-0.22, 0.33, -0.55] : [0, 0.33, -0.5]}
        rotation={sideSaddle ? -Math.PI / 2 : 0}
        look={passengerLook ?? local(seed + 50, seed % 2 ? "conical" : "helmet")}
        face="smile"
        t={t}
        shadow={false}
        name={passengerName}
        inHands={passengerHands}
      />
    )}
    {cargo && <group position={[0, 0.8, -0.85]}>{cargo}</group>}
  </group>
);

/** Xích lô: the passenger rides in front, the driver pedals behind. */
export const Cyclo = ({
  position,
  rotation = 0,
  seed,
  t,
}: {
  position: V3;
  rotation?: number;
  seed: number;
  t: number;
}) => {
  const pedal = Math.sin(t * 6);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.55, 0.32, 0.55]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.3, 0.04, 6, 18]} />
          <meshStandardMaterial color="#202020" />
        </mesh>
      ))}
      <mesh position={[0, 0.36, -0.75]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.34, 0.04, 6, 18]} />
        <meshStandardMaterial color="#202020" />
      </mesh>
      {/* the passenger seat, a bucket with a hood */}
      <mesh position={[0, 0.6, 0.55]}>
        <boxGeometry args={[1, 0.5, 0.8]} />
        <meshStandardMaterial color="#1d4e89" />
      </mesh>
      <mesh position={[0, 1.15, 0.25]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[1.05, 0.7, 0.06]} />
        <meshStandardMaterial color="#1d4e89" />
      </mesh>
      <mesh position={[0, 0.55, -0.2]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.08, 0.08, 1.3]} />
        <meshStandardMaterial color="#c0c0c0" metalness={0.6} />
      </mesh>
      <Person
        pose={{ ...SIT, lean: -0.1, lSh: [-0.2, 0.3], rSh: [-0.2, 0.3], lEl: -1.2, rEl: -1.2 }}
        position={[0, 0.4, 0.5]}
        look={local(seed + 3)}
        face="smile"
        t={t}
        shadow={false}
      />
      <Person
        pose={{
          ...SIT,
          lean: 0.25,
          lHip: -1.2 + pedal * 0.35,
          rHip: -1.2 - pedal * 0.35,
          lKnee: 1.3,
          rKnee: 1.3,
          lSh: [-1.0, 0.2],
          rSh: [-1.0, 0.2],
          lEl: -0.4,
          rEl: -0.4,
        }}
        position={[0, 0.5, -0.8]}
        look={local(seed + 9, "conical")}
        face="flat"
        t={t}
        shadow={false}
      />
    </group>
  );
};

/** A gánh: bamboo pole across the shoulder, a basket at each end. */
const ShoulderPole = ({ swing }: { swing: number }) => (
  <group position={[0, 1.08, 0]} rotation={[0, Math.PI / 2, 0]}>
    <mesh rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.025, 0.025, 1.9, 6]} />
      <meshStandardMaterial color="#c9a36a" />
    </mesh>
    {[-0.85, 0.85].map((x, i) => (
      <group key={x} position={[x, 0, 0]} rotation={[0, 0, swing * (i ? 1 : -1)]}>
        <mesh position={[0, -0.35, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.7, 4]} />
          <meshStandardMaterial color="#6b5a3a" />
        </mesh>
        <mesh position={[0, -0.72, 0]}>
          <cylinderGeometry args={[0.24, 0.18, 0.2, 12]} />
          <meshStandardMaterial color="#b08850" />
        </mesh>
        {[0, 1, 2].map((k) => (
          <mesh key={k} position={[Math.cos(k * 2) * 0.1, -0.6, Math.sin(k * 2) * 0.1]}>
            <sphereGeometry args={[0.08, 8, 6]} />
            <meshStandardMaterial color={["#ffd166", "#06d6a0", "#ef476f"][(k + i) % 3]} />
          </mesh>
        ))}
      </group>
    ))}
  </group>
);

/** A street vendor walking slowly with her pole. */
export const Vendor = ({
  position,
  rotation,
  seed,
  t,
  name,
}: {
  position: V3;
  rotation: number;
  seed: number;
  t: number;
  name?: string;
}) => {
  const pose: Pose = { ...walk(t + seed, 0.55), rSh: [-0.6, 0.3], rEl: -1.6 };
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Person
        pose={pose}
        name={name}
        tagRange={11}
        look={{ ...local(seed, "conical"), shirt: ["#e9e4d8", "#9fb4c8", "#c8a2c8"][seed % 3] }}
        face="smile"
        t={t}
      />
      <ShoulderPole swing={Math.sin((t + seed) * 3.8) * 0.12} />
    </group>
  );
};

const Stool = ({ position, color }: { position: V3; color: string }) => (
  <mesh position={[position[0], 0.21, position[2]]}>
    <cylinderGeometry args={[0.17, 0.2, 0.42, 10]} />
    <meshStandardMaterial color={color} roughness={0.5} />
  </mesh>
);

/** Plastic stools, a low table, iced coffee: the sidewalk café. */
export const SidewalkCafe = ({
  position,
  rotation = 0,
  seed,
  t,
  names,
}: {
  position: V3;
  rotation?: number;
  seed: number;
  t: number;
  names?: string[];
}) => {
  const seats: [number, number, number][] = [
    [-0.75, 0, Math.PI / 2],
    [0.75, 0, -Math.PI / 2],
    [0, 0.75, Math.PI],
  ];
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.46, 0]}>
        <boxGeometry args={[0.8, 0.04, 0.8]} />
        <meshStandardMaterial color="#e63946" />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[0.7, 0.44, 0.7]} />
        <meshStandardMaterial color="#c92f3c" transparent opacity={0.9} />
      </mesh>
      {[-0.15, 0.15].map((x) => (
        <mesh key={x} position={[x, 0.55, 0.1]}>
          <cylinderGeometry args={[0.04, 0.035, 0.14, 10]} />
          <meshStandardMaterial color="#6b3e1f" transparent opacity={0.85} />
        </mesh>
      ))}
      {seats.map(([x, z, r], i) => (
        <group key={i}>
          <Stool position={[x, 0, z]} color={["#1d6fa3", "#e63946", "#2a9d8f"][(i + seed) % 3]} />
          <Person
            pose={
              i === 0
                ? talking(t + seed, SIT, seed)
                : {
                    ...SIT,
                    lean: 0.15,
                    headX: Math.sin(t + i) * 0.1,
                    lSh: [-0.7, 0.2],
                    rSh: [-0.5, 0.2],
                    lEl: -1.1,
                    rEl: -0.9,
                  }
            }
            position={[x, -0.05, z]}
            rotation={r}
            look={local(seed * 3 + i)}
            name={names?.[i]}
            tagRange={11}
            tagLift={i * 0.28}
            face={i === 0 ? "talk" : i === 1 ? "laugh" : "smile"}
            t={t + i}
          />
        </group>
      ))}
    </group>
  );
};

/** Two old men at cờ tướng on the square; a third one watching. */
export const ChessGame = ({
  position,
  rotation = 0,
  t,
  names,
}: {
  position: V3;
  rotation?: number;
  t: number;
  names?: [string, string, string];
}) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.45, 0]}>
      <boxGeometry args={[0.7, 0.05, 0.7]} />
      <meshStandardMaterial color="#d9b26f" />
    </mesh>
    <mesh position={[0, 0.22, 0]}>
      <cylinderGeometry args={[0.05, 0.08, 0.44, 8]} />
      <meshStandardMaterial color="#6b4a33" />
    </mesh>
    {Array.from({ length: 10 }, (_, i) => (
      <mesh key={i} position={[-0.25 + (i % 5) * 0.12, 0.49, (i < 5 ? -1 : 1) * 0.2]}>
        <cylinderGeometry args={[0.035, 0.035, 0.02, 10]} />
        <meshStandardMaterial color={i < 5 ? "#d62828" : "#1a1a1a"} />
      </mesh>
    ))}
    {[-1, 1].map((s, i) => (
      <group key={s}>
        <Stool position={[0, 0, s * 0.7]} color="#1d6fa3" />
        <Person
          pose={{
            ...SIT,
            lean: 0.35,
            headX: 0.35,
            lSh: [-0.6, 0.2],
            rSh: [i ? -0.9 + Math.max(0, Math.sin(t * 2)) * 0.2 : -0.5, 0.15],
            lEl: -1.2,
            rEl: -0.6,
          }}
          position={[0, -0.05, s * 0.7]}
          rotation={s > 0 ? Math.PI : 0}
          name={names?.[i]}
          tagRange={11}
          tagLift={i * 0.3}
          look={{
            ...local(77 + i),
            hair: "#d9d9d9",
            hairStyle: "short",
            hat: i ? "beret" : "none",
            hatColor: "#3a3a3a",
            shirt: i ? "#e9e4d8" : "#9fb4c8",
            glasses: true,
          }}
          face={i ? "flat" : "grin"}
          t={t}
          gaze={[0, -0.8]}
        />
      </group>
    ))}
    <Person
      pose={{
        ...STAND,
        lean: 0.25,
        headX: 0.45,
        lSh: [0.4, 0.1],
        rSh: [0.4, 0.1],
        lEl: -0.6,
        rEl: -0.6,
      }}
      position={[0.9, 0, 0]}
      rotation={-Math.PI / 2}
      look={local(81)}
      name={names?.[2]}
      tagRange={11}
      tagLift={0.6}
      face="o"
      t={t}
      gaze={[0, -0.8]}
    />
  </group>
);

/** A dragon boat: a long hull, a gold dragon head, red lanterns on the roof. */
export const DragonBoat = ({
  position,
  rotation = 0,
  night = 0,
}: {
  position: V3;
  rotation?: number;
  night?: number;
}) => (
  <group position={position} rotation={[0, rotation, 0]}>
    <mesh position={[0, 0.3, 0]}>
      <boxGeometry args={[2.6, 0.9, 11]} />
      <meshStandardMaterial color="#c9302c" />
    </mesh>
    <mesh position={[0, 0.8, 0]}>
      <boxGeometry args={[2.7, 0.12, 11.2]} />
      <meshStandardMaterial color="#e8b32e" />
    </mesh>
    <mesh position={[0, 1.95, -0.5]}>
      <boxGeometry args={[2.3, 2.2, 7]} />
      <meshStandardMaterial color="#f3e2b0" emissive="#ffb35a" emissiveIntensity={night * 0.6} />
    </mesh>
    <mesh position={[0, 3.15, -0.5]}>
      <boxGeometry args={[2.9, 0.2, 7.6]} />
      <meshStandardMaterial color="#a4161a" />
    </mesh>
    {/* the dragon's neck and head at the bow (+z) */}
    <mesh position={[0, 1.6, 6.0]} rotation={[-0.6, 0, 0]}>
      <cylinderGeometry args={[0.28, 0.45, 2.2, 10]} />
      <meshStandardMaterial color="#e8b32e" metalness={0.4} roughness={0.4} />
    </mesh>
    <mesh position={[0, 2.6, 6.6]}>
      <sphereGeometry args={[0.55, 12, 10]} />
      <meshStandardMaterial color="#e8b32e" metalness={0.4} roughness={0.4} />
    </mesh>
    <mesh position={[0, 2.45, 7.2]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[0.3, 0.8, 8]} />
      <meshStandardMaterial color="#2a9d8f" />
    </mesh>
    {[-1, 1].map((s) => (
      <mesh key={s} position={[s * 0.25, 2.85, 6.95]}>
        <sphereGeometry args={[0.1, 8, 6]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    ))}
    {/* the tail at the stern */}
    <mesh position={[0, 1.4, -6.0]} rotation={[0.8, 0, 0]}>
      <coneGeometry args={[0.35, 1.6, 8]} />
      <meshStandardMaterial color="#e8b32e" />
    </mesh>
    {[-3, -1, 1, 3].map((z) =>
      [-1, 1].map((s) => (
        <mesh key={`${z}${s}`} position={[s * 1.3, 2.75, z - 0.5]} scale={[1, 1.3, 1]}>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshStandardMaterial
            color="#e63946"
            emissive="#ff5a3c"
            emissiveIntensity={0.3 + night * 1.6}
          />
        </mesh>
      )),
    )}
  </group>
);

/** A small wooden sampan with a curved roof (đò). */
export const Sampan = ({
  position,
  rotation = 0,
  seed,
  t,
}: {
  position: V3;
  rotation?: number;
  seed: number;
  t: number;
}) => (
  <group position={position} rotation={[0, rotation, Math.sin(t + seed) * 0.03]}>
    <mesh position={[0, 0.15, 0]} scale={[1, 0.5, 1]}>
      <boxGeometry args={[1.3, 0.7, 5]} />
      <meshStandardMaterial color="#5a3d2b" />
    </mesh>
    <mesh position={[0, 0.85, -0.3]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.7, 0.7, 2, 12, 1, true, 0, Math.PI]} />
      <meshStandardMaterial color="#3d2a1e" side={2} />
    </mesh>
    <Person
      pose={{ ...STAND, lSh: [-0.9, 0.3], rSh: [-1.2, 0.2], lEl: -0.5, rEl: -0.3 }}
      position={[0, 0.3, 1.7]}
      look={local(seed, "conical")}
      face="smile"
      t={t}
      shadow={false}
    />
  </group>
);

/* ---------------- the life of the town ---------------- */

const BIKE_COLORS = [
  "#e63946",
  "#3a86ff",
  "#ffd166",
  "#ffffff",
  "#06d6a0",
  "#ff7aa2",
  "#8d99ae",
  "#1b1b1b",
];

/** x along a looping lane between a and b. */
const loop = (seed: number, t: number, speed: number, a: number, b: number) => {
  const L = b - a;
  return a + ((((rand(seed) * L + t * speed) % L) + L) % L);
};

export const TownLife = ({
  t,
  night,
  traffic = true,
  river = true,
  people = true,
  plaza = true,
}: {
  t: number;
  night: number;
  /** Motorbikes on his street (off when the camera stands on the road). */
  traffic?: boolean;
  /** Motorbikes and cyclos on the riverside road. */
  river?: boolean;
  /** Vendors, cafés and walkers on his street. */
  people?: boolean;
  /** People on the square. */
  plaza?: boolean;
}) => {
  const street = HUE.street;
  return (
    <group>
      {traffic &&
        Array.from({ length: 7 }, (_, i) => {
          const dir = i % 2 ? 1 : -1;
          const x = loop(i * 3.3, t, 6 + (i % 3) * 1.5, HUE.x0 - 6, HUE.x1 + 6) * dir;
          return (
            <Motorbike
              key={i}
              position={[x, 0, street + (dir > 0 ? -1.2 : 1.2)]}
              rotation={dir > 0 ? Math.PI / 2 : -Math.PI / 2}
              color={BIKE_COLORS[i % BIKE_COLORS.length]}
              seed={i + 1}
              t={t}
              passenger={i % 3 === 0}
              night={night}
            />
          );
        })}
      {river && (
        <>
          {Array.from({ length: 8 }, (_, i) => {
            const dir = i % 2 ? 1 : -1;
            const x = loop(i * 5.1 + 2, t, 7 + (i % 3) * 1.2, HUE.x0 - 6, HUE.x1 + 6) * dir;
            return (
              <Motorbike
                key={i}
                position={[x, 0, HUE.riverRoad + (dir > 0 ? -1 : 1)]}
                rotation={dir > 0 ? Math.PI / 2 : -Math.PI / 2}
                color={BIKE_COLORS[(i + 3) % BIKE_COLORS.length]}
                seed={i + 20}
                t={t}
                passenger={i % 2 === 0}
                night={night}
              />
            );
          })}
          <Cyclo
            position={[loop(91, t, 1.6, -50, 50), 0, HUE.riverRoad + 1]}
            rotation={Math.PI / 2}
            seed={4}
            t={t}
          />
        </>
      )}
      {people && (
        <>
          <Vendor
            position={[loop(3, t, 0.7, -46, 46), 0, -12.9]}
            rotation={Math.PI / 2}
            seed={2}
            t={t}
            name="Ngọc Như"
          />
          <Vendor
            position={[-loop(8, t, 0.6, -46, 46), 0, -13.0]}
            rotation={-Math.PI / 2}
            seed={5}
            t={t}
            name="Huyền Trân"
          />
          <SidewalkCafe
            position={[-24, 0, -12.3]}
            seed={1}
            t={t}
            names={["Sỹ Nguyễn", "Nguyễn Hoàng Long", "Nguyễn Đức Hiếu"]}
          />
          <SidewalkCafe
            position={[31, 0, -12.3]}
            rotation={0.4}
            seed={4}
            t={t}
            names={["Minh Anh", "Anh Khoa", "Kim Thiên"]}
          />
          {Array.from({ length: 5 }, (_, i) => {
            const dir = i % 2 ? 1 : -1;
            return (
              <Person
                key={i}
                pose={walk(t + i, 0.9)}
                position={[loop(40 + i * 7, t, 1.3, -48, 48) * dir, 0, -12.6 - (i % 2) * 0.4]}
                rotation={dir > 0 ? Math.PI / 2 : -Math.PI / 2}
                look={
                  i === 2
                    ? {
                        skin: "#f5d3b5",
                        shirt: "#ffffff",
                        pants: "#ffffff",
                        hair: "#111",
                        hairStyle: "long",
                        hat: "conical",
                      }
                    : local(60 + i)
                }
                face={i % 2 ? "smile" : "flat"}
                t={t}
              />
            );
          })}
        </>
      )}
      {plaza && (
        <>
          <ChessGame
            position={[-24, 0, -34]}
            rotation={0.3}
            t={t}
            names={["Hồ Đình Dụng", "Ngọc Hùng", "Anh Tài"]}
          />
          <SidewalkCafe
            position={[24, 0, -33]}
            rotation={-0.3}
            seed={7}
            t={t}
            names={["Trần Quốc Đạt", "Phan Sơn", "Hào"]}
          />
          <Vendor
            position={[loop(17, t, 0.5, -28, 28), 0, -27.6]}
            rotation={Math.PI / 2}
            seed={9}
            t={t}
          />
          {/* schoolgirls in white áo dài, strolling by the river */}
          {[0, 1].map((i) => (
            <Person
              key={i}
              pose={walk(t + i * 0.4, 0.7)}
              position={[-loop(23, t, 1.0, -30, 30) + i * 0.8, 0, -52.6 + i * 0.5]}
              rotation={-Math.PI / 2}
              look={{
                skin: "#f5d3b5",
                shirt: "#ffffff",
                pants: "#ffffff",
                hair: "#111",
                hairStyle: "long",
                hat: "conical",
              }}
              face="smile"
              t={t}
            />
          ))}
        </>
      )}
      {/* hoa đăng: paper lotus lanterns drifting on the river at night */}
      {night > 0.3 &&
        Array.from({ length: 40 }, (_, i) => {
          const x = loop(i * 3.7 + 100, t, 0.35 + (i % 4) * 0.08, -60, 60);
          const z = HUE.river0 - 2.5 - rand(i * 5.3) * 14;
          const bob = Math.sin(t * 1.5 + i) * 0.03;
          return (
            <group key={`l${i}`} position={[x, -0.5 + bob, z]} rotation={[0, i, 0]}>
              <mesh position={[0, 0.08, 0]}>
                <coneGeometry args={[0.22, 0.22, 8, 1, true]} />
                <meshStandardMaterial
                  color={["#ff7aa2", "#ff4d6d", "#ffd166", "#f7f3e8"][i % 4]}
                  emissive="#ff9a5a"
                  emissiveIntensity={0.6 * night}
                  side={2}
                />
              </mesh>
              <mesh position={[0, 0.14, 0]}>
                <sphereGeometry args={[0.06, 8, 6]} />
                <meshBasicMaterial color="#fff1b0" toneMapped={false} />
              </mesh>
            </group>
          );
        })}
      {/* on the river */}
      <DragonBoat
        position={[loop(5, t, 1.2, -120, 120), -0.4, -70]}
        rotation={Math.PI / 2}
        night={night}
      />
      <DragonBoat
        position={[-loop(12, t, 0.9, -120, 120), -0.4, -83]}
        rotation={-Math.PI / 2}
        night={night}
      />
      {[0, 1, 2].map((i) => (
        <Sampan
          key={i}
          position={[-60 + i * 50 + Math.sin(t * 0.2 + i) * 4, -0.45, -62 - i * 9]}
          rotation={0.5 + i}
          seed={i + 30}
          t={t}
        />
      ))}
    </group>
  );
};
