import { Person, SIT, STAND, wave, type Look, type Pose } from "../three/person";
import type { V3 } from "../three/stage";

// Chiến's family: Ba, Mẹ and his little sister.

export const BA: Look = {
  skin: "#d9a07a",
  shirt: "#3a5a8c",
  pants: "#3a3a3a",
  hair: "#3a3a3a",
  hairStyle: "short",
  glasses: true,
};
export const ME: Look = {
  skin: "#f2c9a0",
  shirt: "#e88aa8",
  pants: "#3a3550",
  hair: "#1a1410",
  hairStyle: "bun",
};
export const EM: Look = {
  skin: "#f5d3b5",
  shirt: "#ffd166",
  pants: "#ff7aa2",
  hair: "#1a1410",
  hairStyle: "ponytail",
};

/** A đá cầu kick, the right foot flicking up on every bounce. */
const kick = (t: number): Pose => {
  const up = Math.max(0, Math.sin(t * 7));
  return {
    ...STAND,
    headX: 0.3,
    rHip: -0.2 - up * 1.1,
    rKnee: 0.6 - up * 0.4,
    lKnee: 0.15,
    lSh: [-0.2, 1.2],
    rSh: [-0.2, 1.0],
    lEl: -0.3,
    rEl: -0.3,
  };
};

/** The feathered shuttlecock. */
const Shuttle = ({ position }: { position: V3 }) => (
  <group position={position}>
    <mesh>
      <cylinderGeometry args={[0.05, 0.05, 0.05, 10]} />
      <meshStandardMaterial color="#d62828" />
    </mesh>
    <mesh position={[0, 0.12, 0]}>
      <coneGeometry args={[0.09, 0.2, 10, 1, true]} />
      <meshStandardMaterial color="#f7f3e8" side={2} />
    </mesh>
  </group>
);

/**
 * Evening outside the house: Ba on a plastic stool with his tea, Mẹ at the
 * shop door, his sister playing đá cầu on the pavement. Positions are in
 * world coordinates; the house front is at z = -2.7.
 */
export const FamilyOutside = ({ t, names }: { t: number; names: boolean }) => {
  const bounce = Math.abs(Math.sin(t * 3.5));
  return (
    <group>
      <mesh position={[-2.3, 0.21, -4.0]}>
        <cylinderGeometry args={[0.17, 0.2, 0.42, 10]} />
        <meshStandardMaterial color="#1d6fa3" />
      </mesh>
      <Person
        pose={{ ...SIT, lean: 0.1, lSh: [-0.9, 0.2], rSh: [-0.4, 0.2], lEl: -1.3, rEl: -0.8 }}
        position={[-2.3, -0.05, -4.0]}
        rotation={Math.PI - 0.3}
        look={BA}
        face="smile"
        t={t}
        name={names ? "Chiến's dad" : undefined}
      />
      <Person
        pose={wave(t, STAND)}
        position={[1.7, 0, -3.65]}
        rotation={Math.PI + 0.35}
        look={ME}
        face="smile"
        t={t}
        name={names ? "Chiến's mom" : undefined}
        tagLift={0.25}
      />
      <Person
        pose={kick(t)}
        position={[0.1, 0, -5.0]}
        rotation={Math.PI - 0.5}
        look={EM}
        face="laugh"
        t={t}
        scale={0.8}
        name={names ? "Chiến's sister" : undefined}
      />
      <Shuttle position={[0.25, 0.55 + bounce * 1.5, -5.35]} />
    </group>
  );
};

/**
 * Bedtime: the family looks in from the back of his room, the little sister
 * on tiptoe, Mẹ with a finger to her lips. Room coordinates (y = 0 is his
 * floor).
 */
export const FamilyAtDoor = ({ t, names }: { t: number; names: boolean }) => {
  const toBed = 2.2;
  const shh: Pose = { ...STAND, headX: 0.15, rSh: [-1.4, 0.4], rEl: -2.2, lSh: [0.1, 0.1] };
  return (
    <group>
      <Person
        pose={{ ...STAND, headX: 0.15, lSh: [-0.3, 0.6], lEl: -1.4 }}
        position={[-1.5, 0, 2.1]}
        rotation={toBed}
        look={BA}
        face="smile"
        t={t}
        name={names ? "Chiến's dad" : undefined}
      />
      <Person
        pose={shh}
        position={[-0.1, 0, 2.15]}
        rotation={toBed}
        look={ME}
        face="smile"
        t={t}
        name={names ? "Chiến's mom" : undefined}
        tagLift={0.3}
      />
      <Person
        pose={{ ...STAND, hipY: 0.58 + Math.abs(Math.sin(t * 2)) * 0.03, headX: -0.1 }}
        position={[-0.8, 0, 1.55]}
        rotation={toBed}
        look={EM}
        face="grin"
        t={t}
        scale={0.8}
        name={names ? "Chiến's sister" : undefined}
      />
    </group>
  );
};
