import { useMemo } from "react";
import * as THREE from "three";
import { T } from "../lib/theme";
import type { V3 } from "./stage";

// The Avalanche mark in 3D: a red bevelled coin with the white peaks
// standing out on both faces. Same shapes as AvalancheMark in ui/kit.tsx
// (a 100×100 box, origin at its centre, y up).

const PEAKS: [number, number][][] = [
  [
    [44, 24],
    [20, 72],
    [44, 72],
    [54, 54],
  ],
  [
    [62, 50],
    [48, 74],
    [76, 74],
  ],
];

let shared: { coin: THREE.BufferGeometry; peaks: THREE.BufferGeometry[] } | null = null;
function geometry() {
  if (shared) return shared;
  const coin = new THREE.CylinderGeometry(1, 1, 0.22, 48);
  coin.rotateX(Math.PI / 2);
  const peaks = PEAKS.map((pts) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => {
      const px = (x - 50) / 50;
      const py = (50 - y) / 50;
      if (i) shape.lineTo(px, py);
      else shape.moveTo(px, py);
    });
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.34,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.015,
      bevelSegments: 1,
    });
    g.translate(0, 0, -0.17);
    return g;
  });
  shared = { coin, peaks };
  return shared;
}

/** The Avalanche logo as a 3D coin. `spin` turns it about y (radians). */
export const AvalancheLogo = ({
  position,
  scale = 1,
  spin = 0,
  glow = 0.4,
  ring = true,
}: {
  position: V3;
  scale?: number;
  spin?: number;
  /** 0..2, how much the red glows (it lights up at night). */
  glow?: number;
  /** A thin white rim around the coin. */
  ring?: boolean;
}) => {
  const g = geometry();
  const red = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: T.avalanche,
        emissive: T.avalanche,
        roughness: 0.35,
        metalness: 0.2,
      }),
    [],
  );
  const white = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 0.25,
        roughness: 0.3,
      }),
    [],
  );
  red.emissiveIntensity = glow * 0.5;
  return (
    <group position={position} scale={scale} rotation={[0, spin, 0]}>
      <mesh geometry={g.coin} material={red} />
      {g.peaks.map((p, i) => (
        <mesh key={i} geometry={p} material={white} />
      ))}
      {ring && (
        <mesh material={white}>
          <torusGeometry args={[1.0, 0.035, 8, 64]} />
        </mesh>
      )}
    </group>
  );
};
