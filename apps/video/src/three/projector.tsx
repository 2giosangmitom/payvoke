import { createContext, useContext, type ReactNode } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import * as THREE from "three";
import { T } from "../lib/theme";
import { camAt, type CamKey, type V3 } from "./stage";

// Put real React UI on a screen inside the 3D world. The camera is a pure
// function of time (camAt), so we can project the screen's four corners to
// pixels ourselves and map a flat DOM layer onto that quad with a CSS
// homography. The UI stays crisp, real markup, and sits exactly on the
// laptop or billboard it belongs to.

/** True inside a projected screen: UI scenes skip their own tilt-in. */
export const OnScreen = createContext(false);
export const useOnScreen = () => useContext(OnScreen);

/** Corners (TL, TR, BR, BL) of a flat screen centred at `c`, facing yaw/pitch. */
export function screenCorners(c: V3, w: number, h: number, yaw = 0, pitch = 0): V3[] {
  const e = new THREE.Euler(pitch, yaw, 0, "YXZ");
  return [
    [-w / 2, h / 2],
    [w / 2, h / 2],
    [w / 2, -h / 2],
    [-w / 2, -h / 2],
  ].map(([x, y]) => {
    const v = new THREE.Vector3(x, y, 0).applyEuler(e);
    return [c[0] + v.x, c[1] + v.y, c[2] + v.z] as V3;
  });
}

const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 900);

function project(keys: CamKey[], t: number, corners: V3[], w: number, h: number) {
  const c = camAt(keys, t);
  camera.aspect = w / h;
  camera.fov = c.fov ?? 45;
  camera.position.set(...c.pos);
  camera.lookAt(...c.look);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return corners.map((p) => {
    const v = new THREE.Vector3(...p).project(camera);
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, v.z] as [number, number, number];
  });
}

/** CSS matrix3d mapping the rect (0,0)-(sw,sh) onto quad `dst` (TL,TR,BR,BL). */
function homography(sw: number, sh: number, dst: [number, number][]) {
  const src = [
    [0, 0],
    [sw, 0],
    [sw, sh],
    [0, sh],
  ];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let k = col; k < 8; k++) A[r][k] -= f * A[col][k];
      b[r] -= f * b[col];
    }
  }
  const [a, bb, c, d, e, f, g, h] = b.map((v, i) => v / A[i][i]);
  return `matrix3d(${a},${d},0,${g},${bb},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}

/**
 * Renders `children` (laid out at uiW × uiH) onto the screen quad `corners`
 * as seen by the camera `keys` at time `t`. Nothing renders when the
 * screen is behind the camera.
 */
export const ProjectedUI = ({
  keys,
  t,
  corners,
  children,
  uiW = 1920,
  uiH = 1080,
  glow = true,
  opacity = 1,
}: {
  keys: CamKey[];
  t: number;
  corners: V3[];
  children: ReactNode;
  uiW?: number;
  uiH?: number;
  glow?: boolean;
  opacity?: number;
}) => {
  const { width, height } = useVideoConfig();
  const pts = project(keys, t, corners, width, height);
  if (pts.some((p) => p[2] > 1 || p[2] < -1)) return null;
  const transform = homography(
    uiW,
    uiH,
    pts.map((p) => [p[0], p[1]]),
  );
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: uiW,
          height: uiH,
          transformOrigin: "0 0",
          transform,
          background: T.bgDeep,
          overflow: "hidden",
        }}
      >
        <OnScreen.Provider value={true}>{children}</OnScreen.Provider>
        {glow && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(160deg, #ffffff14 0%, transparent 40%)",
              boxShadow: "inset 0 0 120px #0008",
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
