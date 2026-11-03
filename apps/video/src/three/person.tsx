import type { ReactNode } from "react";
import * as THREE from "three";
import type { V3 } from "./stage";

// A big-headed little person made of capsules and spheres, posed by joint
// angles. Faces +z. Angles in radians: negative shoulder/hip x swings the
// limb forward, positive knee x bends the shin back, shoulder z raises the
// arm out to the side.
import { NameTag } from "./nametag";

export type Pose = {
  hipY: number;
  lean: number;
  twist: number;
  headX: number;
  headY: number;
  headZ: number;
  lSh: [number, number];
  rSh: [number, number];
  lEl: number;
  rEl: number;
  lHip: number;
  rHip: number;
  lKnee: number;
  rKnee: number;
};

export const STAND: Pose = {
  hipY: 0.55,
  lean: 0,
  twist: 0,
  headX: 0,
  headY: 0,
  headZ: 0,
  lSh: [0, 0.1],
  rSh: [0, 0.1],
  lEl: 0,
  rEl: 0,
  lHip: 0,
  rHip: 0,
  lKnee: 0,
  rKnee: 0,
};

export const SIT: Pose = { ...STAND, hipY: 0.5, lHip: -1.5, rHip: -1.5, lKnee: 1.5, rKnee: 1.5 };

const mixN = (a: number, b: number, k: number) => a + (b - a) * k;
export function mixPose(a: Pose, b: Pose, k: number): Pose {
  const out = { ...a };
  for (const key of Object.keys(a) as (keyof Pose)[]) {
    const va = a[key];
    const vb = b[key];
    (out as Record<string, unknown>)[key] = Array.isArray(va)
      ? [mixN(va[0], (vb as number[])[0], k), mixN(va[1], (vb as number[])[1], k)]
      : mixN(va as number, vb as number, k);
  }
  return out;
}

export const typing = (t: number, speed = 1): Pose => ({
  ...SIT,
  lean: 0.18,
  headX: 0.12 + Math.sin(t * 2) * 0.03,
  lSh: [-0.75 + Math.max(0, Math.sin(t * 14 * speed)) * 0.12, 0.25],
  rSh: [-0.75 + Math.max(0, Math.sin(t * 14 * speed + 2)) * 0.12, 0.25],
  lEl: -0.95,
  rEl: -0.95,
});

export const headInHands = (t: number): Pose => ({
  ...SIT,
  lean: 0.42,
  headX: 0.35 + Math.sin(t * 1.3) * 0.04,
  headZ: Math.sin(t * 0.9) * 0.08,
  lSh: [-1.55, 0.35],
  rSh: [-1.55, 0.35],
  lEl: -2.3,
  rEl: -2.3,
});

export const slumped = (t: number): Pose => ({
  ...SIT,
  lean: 0.55,
  headX: 0.6,
  headZ: 0.25 + Math.sin(t) * 0.04,
  lSh: [-0.9, 0.2],
  rSh: [-0.2, 0.15],
  lEl: -0.6,
  rEl: -0.2,
});

export const cheer = (t: number, base: Pose = STAND): Pose => ({
  ...base,
  hipY: base.hipY + Math.abs(Math.sin(t * 7)) * (base === STAND ? 0.12 : 0.03),
  headX: -0.2,
  lSh: [-0.3, 2.6 + Math.sin(t * 14) * 0.2],
  rSh: [-0.3, 2.6 + Math.sin(t * 14 + 1) * 0.2],
  lEl: -0.3,
  rEl: -0.3,
});

export const walk = (t: number, speed = 1): Pose => {
  const s = Math.sin(t * 7 * speed);
  return {
    ...STAND,
    hipY: 0.55 + Math.abs(Math.cos(t * 7 * speed)) * 0.03,
    lHip: s * 0.55,
    rHip: -s * 0.55,
    lKnee: Math.max(0, -s) * 0.7 + 0.1,
    rKnee: Math.max(0, s) * 0.7 + 0.1,
    lSh: [-s * 0.5, 0.12],
    rSh: [s * 0.5, 0.12],
    lEl: -0.3,
    rEl: -0.3,
  };
};

/** Both hands out in front, holding something. */
export const holding = (base: Pose = STAND): Pose => ({
  ...base,
  lSh: [-1.15, 0.15],
  rSh: [-1.15, 0.15],
  lEl: -0.5,
  rEl: -0.5,
  headX: 0.15,
});

/** One arm stretched up and forward, mid-throw or reaching. */
export const reachUp = (base: Pose = STAND): Pose => ({
  ...base,
  rSh: [-2.5, 0.15],
  rEl: -0.1,
  lSh: [-0.4, 0.2],
  headX: -0.35,
});

/** Waving with the right hand. */
export const wave = (t: number, base: Pose = STAND): Pose => ({
  ...base,
  rSh: [-0.2, 2.4],
  rEl: -0.6 + Math.sin(t * 9) * 0.5,
  headZ: 0.1,
});

export const facepalm = (base: Pose = SIT): Pose => ({
  ...base,
  lean: 0.25,
  headX: 0.2,
  rSh: [-1.7, 0.6],
  rEl: -2.4,
  lSh: [-0.6, 0.2],
  lEl: -0.6,
});

/** Hands moving while explaining something, with little nods. */
export const talking = (t: number, base: Pose = STAND, seed = 0): Pose => ({
  ...base,
  headX: Math.sin(t * 5 + seed) * 0.08,
  headY: Math.sin(t * 1.7 + seed) * 0.15,
  headZ: Math.sin(t * 2.3 + seed) * 0.06,
  lSh: [-0.55 + Math.sin(t * 4 + seed) * 0.25, 0.35],
  rSh: [-0.7 + Math.sin(t * 5.3 + seed + 1) * 0.3, 0.3 + Math.max(0, Math.sin(t * 2 + seed)) * 0.4],
  lEl: -1.1 + Math.sin(t * 6 + seed) * 0.3,
  rEl: -1.0 + Math.sin(t * 4.4 + seed) * 0.35,
});

/** Listening with a hand on the chin, nodding. */
export const listening = (t: number, base: Pose = STAND): Pose => ({
  ...base,
  headX: 0.08 + Math.max(0, Math.sin(t * 6)) * 0.12,
  headZ: 0.12,
  rSh: [-1.3, 0.45],
  rEl: -2.2,
  lSh: [-0.35, 0.5],
  lEl: -1.5,
});

export type Look = {
  skin?: string;
  shirt?: string;
  pants?: string;
  hair?: string;
  shoes?: string;
  hairStyle?: "short" | "spiky" | "long" | "bun" | "afro" | "bald" | "ponytail";
  hat?: "cap" | "beret" | "beanie" | "conical" | "helmet" | "none";
  hatColor?: string;
  glasses?: boolean;
  beard?: boolean;
};

export type Face = "smile" | "grin" | "flat" | "o" | "sad" | "sleep" | "talk" | "angry" | "laugh";

// One soft round shadow texture shared by everyone.
let blobTexture: THREE.CanvasTexture | null = null;
function blob() {
  if (blobTexture) return blobTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  blobTexture = new THREE.CanvasTexture(c);
  return blobTexture;
}

const Limb = ({ r, len, color }: { r: number; len: number; color: string }) => (
  <mesh position={[0, -len / 2 - r * 0.4, 0]}>
    <capsuleGeometry args={[r, len, 4, 10]} />
    <meshStandardMaterial color={color} roughness={0.75} />
  </mesh>
);

const INK = "#24140f";

function Mouth({ face, t }: { face: Face; t: number }) {
  const z = 0.262;
  if (face === "smile")
    return (
      <mesh position={[0, 0.115, z]} rotation={[0.3, 0, Math.PI]}>
        <torusGeometry args={[0.065, 0.016, 6, 16, Math.PI]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    );
  if (face === "grin" || face === "laugh") {
    const open = face === "laugh" ? 1 + Math.abs(Math.sin(t * 14)) * 0.35 : 1;
    return (
      <group position={[0, 0.115, z - 0.006]} rotation={[0.3, 0, 0]} scale={[1, open, 1]}>
        <mesh rotation={[0, 0, Math.PI]}>
          <circleGeometry args={[0.085, 20, 0, Math.PI]} />
          <meshBasicMaterial color="#5a1f1f" />
        </mesh>
        <mesh position={[0, -0.045, 0.002]} scale={[1, 0.5, 1]}>
          <circleGeometry args={[0.045, 16]} />
          <meshBasicMaterial color="#e86a6a" />
        </mesh>
        <mesh position={[0, -0.004, 0.003]}>
          <planeGeometry args={[0.15, 0.022]} />
          <meshBasicMaterial color="#fffaf0" />
        </mesh>
      </group>
    );
  }
  if (face === "talk" || face === "o") {
    const open = face === "o" ? 1 : 0.35 + Math.abs(Math.sin(t * 13)) * 0.75;
    return (
      <mesh
        position={[0, 0.105, z - 0.004]}
        rotation={[0.3, 0, 0]}
        scale={[face === "o" ? 0.8 : 1, open, 1]}
      >
        <circleGeometry args={[0.048, 18]} />
        <meshBasicMaterial color="#5a1f1f" />
      </mesh>
    );
  }
  if (face === "sad" || face === "angry")
    return (
      <mesh position={[0, 0.085, z]} rotation={[0.3, 0, 0]}>
        <torusGeometry args={[0.055, 0.015, 6, 16, Math.PI]} />
        <meshStandardMaterial color={INK} />
      </mesh>
    );
  return (
    <mesh position={[0, 0.11, z]} rotation={[0.3, 0, 0]}>
      <boxGeometry args={[face === "sleep" ? 0.06 : 0.1, 0.016, 0.01]} />
      <meshStandardMaterial color={INK} />
    </mesh>
  );
}

function Hair({ look }: { look: Look }) {
  const c = look.hair ?? "#2b1d14";
  const style = look.hairStyle ?? "short";
  if (style === "bald" || look.hat === "beanie" || look.hat === "helmet") return null;
  const mat = <meshStandardMaterial color={c} roughness={0.9} />;
  // Shells sit a couple of centimetres off the skull: no coincident
  // surfaces, so nothing z-fights (the flicker in the old render).
  const cap = (
    <mesh position={[0, 0.26, -0.01]} scale={[1, 0.92, 1]}>
      <sphereGeometry args={[0.305, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.42]} />
      {mat}
    </mesh>
  );
  const back = (
    <mesh position={[0, 0.24, -0.015]}>
      <sphereGeometry args={[0.3, 24, 16, Math.PI, Math.PI, 0, Math.PI * 0.72]} />
      {mat}
    </mesh>
  );
  if (style === "afro")
    return (
      <mesh position={[0, 0.37, -0.1]}>
        <sphereGeometry args={[0.35, 20, 16]} />
        <meshStandardMaterial color={c} roughness={1} />
      </mesh>
    );
  return (
    <group>
      {cap}
      {back}
      {style === "spiky" &&
        Array.from({ length: 7 }, (_, i) => {
          const a = (i / 7) * Math.PI * 2;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.17, 0.5, Math.sin(a) * 0.15 - 0.03]}
              rotation={[Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5]}
            >
              <coneGeometry args={[0.07, 0.2, 6]} />
              {mat}
            </mesh>
          );
        })}
      {style === "long" && (
        <mesh position={[0, 0.02, -0.16]}>
          <boxGeometry args={[0.5, 0.5, 0.16]} />
          {mat}
        </mesh>
      )}
      {style === "bun" && (
        <mesh position={[0, 0.58, -0.08]}>
          <sphereGeometry args={[0.12, 14, 12]} />
          {mat}
        </mesh>
      )}
      {style === "ponytail" && (
        <mesh position={[0, 0.2, -0.36]} rotation={[0.5, 0, 0]}>
          <capsuleGeometry args={[0.07, 0.25, 4, 8]} />
          {mat}
        </mesh>
      )}
    </group>
  );
}

const BROWS: Record<Face, { tilt: number; lift: number }> = {
  smile: { tilt: 0.1, lift: 0.01 },
  grin: { tilt: 0.15, lift: 0.025 },
  laugh: { tilt: 0.15, lift: 0.03 },
  flat: { tilt: 0, lift: 0 },
  o: { tilt: 0, lift: 0.045 },
  talk: { tilt: 0.05, lift: 0.015 },
  sad: { tilt: -0.4, lift: 0.01 },
  angry: { tilt: 0.45, lift: -0.02 },
  sleep: { tilt: 0, lift: -0.01 },
};

export const Person = ({
  pose,
  position = [0, 0, 0],
  rotation = 0,
  look = {},
  face = "flat",
  blink = false,
  scale = 1,
  gaze = [0, 0],
  inHands,
  overHead,
  shadow = true,
  t = 0,
  name,
  tagLift = 0,
  tagRange,
}: {
  pose: Pose;
  position?: V3;
  rotation?: number;
  look?: Look;
  face?: Face;
  blink?: boolean;
  scale?: number;
  /** Where the pupils look, -1..1 each way. */
  gaze?: [number, number];
  /** Rendered between the hands, in torso space. */
  inHands?: ReactNode;
  /** Rendered above the head, in head space (thought bubbles). */
  overHead?: ReactNode;
  shadow?: boolean;
  /** Time, for talking and laughing mouths. */
  t?: number;
  /** A floating name tag: a name, or [name, second line]. */
  name?: string;
  /** Raise the name tag (people standing close together). */
  tagLift?: number;
  /** Hide the name tag beyond this distance from the camera. */
  tagRange?: number;
}) => {
  const skin = look.skin ?? "#f2c9a0";
  const shirt = look.shirt ?? "#3f7d63";
  const pants = look.pants ?? "#2b3445";
  const shoes = look.shoes ?? "#1b1b1b";
  const eyesShut = blink || face === "sleep";
  const brow = BROWS[face];
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {shadow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]} renderOrder={1}>
          <planeGeometry args={[1.1, 1.1]} />
          <meshBasicMaterial
            map={blob()}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      )}
      <group position={[0, pose.hipY, 0]} rotation={[0, pose.twist, 0]}>
        {/* legs */}
        {[1, -1].map((side) => (
          <group
            key={side}
            position={[side * 0.1, 0, 0]}
            rotation={[side > 0 ? pose.lHip : pose.rHip, 0, 0]}
          >
            <Limb r={0.078} len={0.17} color={pants} />
            <group position={[0, -0.28, 0]} rotation={[side > 0 ? pose.lKnee : pose.rKnee, 0, 0]}>
              <Limb r={0.07} len={0.15} color={pants} />
              <mesh position={[0, -0.26, 0.05]}>
                <boxGeometry args={[0.14, 0.09, 0.24]} />
                <meshStandardMaterial color={shoes} roughness={0.5} />
              </mesh>
              <mesh position={[0, -0.3, 0.05]}>
                <boxGeometry args={[0.15, 0.025, 0.25]} />
                <meshStandardMaterial color="#f3efe0" />
              </mesh>
            </group>
          </group>
        ))}
        {/* waistband */}
        <mesh position={[0, 0.06, 0]}>
          <cylinderGeometry args={[0.215, 0.2, 0.14, 16]} />
          <meshStandardMaterial color={pants} roughness={0.8} />
        </mesh>
        <group rotation={[pose.lean, 0, 0]}>
          <mesh position={[0, 0.27, 0]}>
            <capsuleGeometry args={[0.2, 0.2, 4, 14]} />
            <meshStandardMaterial color={shirt} roughness={0.7} />
          </mesh>
          {[1, -1].map((side) => {
            const sh = side > 0 ? pose.lSh : pose.rSh;
            return (
              <group
                key={side}
                position={[side * 0.25, 0.43, 0]}
                rotation={[sh[0], 0, sh[1] * side]}
              >
                <Limb r={0.062} len={0.13} color={shirt} />
                <group position={[0, -0.22, 0]} rotation={[side > 0 ? pose.lEl : pose.rEl, 0, 0]}>
                  <Limb r={0.054} len={0.11} color={skin} />
                  <mesh position={[0, -0.2, 0]}>
                    <sphereGeometry args={[0.072, 14, 12]} />
                    <meshStandardMaterial color={skin} />
                  </mesh>
                </group>
              </group>
            );
          })}
          {inHands && <group position={[0, 0.35, 0.42]}>{inHands}</group>}
          {/* head */}
          <group position={[0, 0.6, 0]} rotation={[pose.headX, pose.headY, pose.headZ]}>
            <mesh position={[0, 0.04, 0]}>
              <cylinderGeometry args={[0.06, 0.07, 0.1, 10]} />
              <meshStandardMaterial color={skin} />
            </mesh>
            <mesh position={[0, 0.24, 0]}>
              <sphereGeometry args={[0.28, 28, 20]} />
              <meshStandardMaterial color={skin} roughness={0.6} />
            </mesh>
            {[1, -1].map((side) => (
              <mesh key={`ear${side}`} position={[side * 0.275, 0.22, -0.01]} scale={[0.5, 1, 0.8]}>
                <sphereGeometry args={[0.065, 12, 10]} />
                <meshStandardMaterial color={skin} />
              </mesh>
            ))}
            <mesh position={[0, 0.19, 0.285]}>
              <sphereGeometry args={[0.036, 12, 10]} />
              <meshStandardMaterial color={skin} roughness={0.5} />
            </mesh>
            <Hair look={look} />
            {/* eyes: white, pupil, a spark */}
            {[1, -1].map((side) => (
              <group
                key={`eye${side}`}
                position={[side * 0.1, 0.275, 0.235]}
                scale={[1, eyesShut ? 0.12 : 1, 1]}
              >
                <mesh scale={[1, 1.2, 0.55]}>
                  <sphereGeometry args={[0.068, 16, 12]} />
                  <meshStandardMaterial color={eyesShut ? INK : "#ffffff"} roughness={0.3} />
                </mesh>
                {!eyesShut && (
                  <>
                    <mesh position={[gaze[0] * 0.022, gaze[1] * 0.025, 0.033]}>
                      <sphereGeometry args={[0.038, 14, 10]} />
                      <meshBasicMaterial color="#1a1210" />
                    </mesh>
                    <mesh position={[gaze[0] * 0.022 + 0.014, gaze[1] * 0.025 + 0.016, 0.066]}>
                      <sphereGeometry args={[0.011, 8, 6]} />
                      <meshBasicMaterial color="#ffffff" />
                    </mesh>
                  </>
                )}
              </group>
            ))}
            {/* brows carry most of the expression */}
            {[1, -1].map((side) => (
              <mesh
                key={`brow${side}`}
                position={[side * 0.1, 0.37 + brow.lift, 0.252]}
                rotation={[0.2, 0, side * -brow.tilt]}
              >
                <boxGeometry args={[0.11, 0.024, 0.02]} />
                <meshStandardMaterial color={look.hair ?? INK} />
              </mesh>
            ))}
            {[1, -1].map((side) => (
              <mesh
                key={`cheek${side}`}
                position={[side * 0.17, 0.165, 0.22]}
                scale={[1, 0.7, 0.4]}
              >
                <sphereGeometry args={[0.05, 10, 8]} />
                <meshBasicMaterial color="#ff9b8a" transparent opacity={0.5} depthWrite={false} />
              </mesh>
            ))}
            <Mouth face={face} t={t} />
            {look.beard && (
              <mesh position={[0, 0.09, 0.13]} scale={[1, 0.7, 0.75]}>
                <sphereGeometry
                  args={[0.2, 18, 12, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.4]}
                />
                <meshStandardMaterial color={look.hair ?? INK} roughness={1} />
              </mesh>
            )}
            {look.glasses && (
              <group position={[0, 0.275, 0.3]}>
                {[1, -1].map((side) => (
                  <mesh key={side} position={[side * 0.1, 0, 0]}>
                    <torusGeometry args={[0.072, 0.012, 6, 18]} />
                    <meshStandardMaterial color="#1a1a1a" />
                  </mesh>
                ))}
                <mesh>
                  <boxGeometry args={[0.06, 0.012, 0.012]} />
                  <meshStandardMaterial color="#1a1a1a" />
                </mesh>
              </group>
            )}
            {look.hat === "cap" && (
              <group position={[0, 0.42, 0]}>
                <mesh scale={[1, 0.55, 1]}>
                  <sphereGeometry args={[0.315, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshStandardMaterial color={look.hatColor ?? "#c0392b"} />
                </mesh>
                <mesh position={[0, 0.0, 0.28]} rotation={[0.15, 0, 0]}>
                  <boxGeometry args={[0.32, 0.02, 0.22]} />
                  <meshStandardMaterial color={look.hatColor ?? "#c0392b"} />
                </mesh>
              </group>
            )}
            {look.hat === "beret" && (
              <mesh position={[0.04, 0.52, -0.02]} rotation={[0, 0, -0.25]} scale={[1, 0.3, 1]}>
                <sphereGeometry args={[0.3, 18, 12]} />
                <meshStandardMaterial color={look.hatColor ?? "#2b2b2b"} />
              </mesh>
            )}
            {look.hat === "beanie" && (
              <group>
                <mesh position={[0, 0.36, -0.01]} scale={[1.08, 0.82, 1.08]}>
                  <sphereGeometry args={[0.29, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshStandardMaterial color={look.hatColor ?? "#e5bd83"} />
                </mesh>
                <mesh position={[0, 0.63, -0.01]}>
                  <sphereGeometry args={[0.06, 10, 8]} />
                  <meshStandardMaterial color="#ffffff" />
                </mesh>
              </group>
            )}
            {look.hat === "conical" && (
              // nón lá: the palm-leaf cone hat
              <mesh position={[0, 0.66, 0]}>
                <coneGeometry args={[0.56, 0.34, 24, 1]} />
                <meshStandardMaterial color={look.hatColor ?? "#e9d9a6"} roughness={0.9} />
              </mesh>
            )}
            {look.hat === "helmet" && (
              <group position={[0, 0.36, 0]}>
                <mesh scale={[1.08, 0.95, 1.1]}>
                  <sphereGeometry args={[0.33, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                  <meshStandardMaterial color={look.hatColor ?? "#e63946"} roughness={0.4} />
                </mesh>
                <mesh position={[0, 0.02, 0.3]} rotation={[0.2, 0, 0]}>
                  <boxGeometry args={[0.36, 0.02, 0.16]} />
                  <meshStandardMaterial color="#222" />
                </mesh>
              </group>
            )}
            {overHead && <group position={[0, 0.3, 0]}>{overHead}</group>}
            {name && <NameTag name={name} lift={tagLift} range={tagRange} />}
          </group>
        </group>
      </group>
    </group>
  );
};

/** Pose over time from a list of (start time, pose) segments, blending
 * from the previous pose over `blend` seconds at each change. */
export function poseTrack(
  t: number,
  segs: { at: number; pose: (t: number) => Pose }[],
  blend = 0.35,
): Pose {
  let i = 0;
  while (i + 1 < segs.length && t >= segs[i + 1].at) i++;
  const cur = segs[i].pose(t);
  if (i === 0) return cur;
  const k = (t - segs[i].at) / blend;
  if (k >= 1) return cur;
  const s = k * k * (3 - 2 * k);
  return mixPose(segs[i - 1].pose(t), cur, s);
}

/** Pick a value from (start time, value) segments. */
export function track<V>(t: number, segs: [number, V][]): V {
  let v = segs[0][1];
  for (const [at, value] of segs) if (t >= at) v = value;
  return v;
}
