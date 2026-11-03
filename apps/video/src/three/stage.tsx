import { ThreeCanvas } from "@remotion/three";
import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, type ReactNode } from "react";
import { useVideoConfig } from "remotion";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Shared plumbing for the story scenes: a canvas per scene, a camera that
// follows keyframes, and canvas-drawn textures for screens, signs and notes.

// React Three Fiber 9.8 still creates a THREE.Clock for every canvas, and
// three r183+ warns that Clock is deprecated. Remotion drives every frame
// itself, so that clock is never used: drop just that one warning and pass
// everything else through unchanged.
THREE.setConsoleFunction((type: string, message: string, ...params: unknown[]) => {
  if (message.startsWith("THREE.Clock: This module has been deprecated")) return;
  const log = type === "error" ? console.error : type === "warn" ? console.warn : console.log;
  log(message, ...params);
});

export type V3 = [number, number, number];
export type CamKey = { t: number; pos: V3; look: V3; fov?: number };

const smooth = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerp3 = (a: V3, b: V3, k: number): V3 => [
  lerp(a[0], b[0], k),
  lerp(a[1], b[1], k),
  lerp(a[2], b[2], k),
];

/** Camera position, target and fov at time t, eased between keys. */
export function camAt(keys: CamKey[], t: number) {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const k = smooth((t - a.t) / Math.max(0.0001, b.t - a.t));
      return {
        t,
        pos: lerp3(a.pos, b.pos, k),
        look: lerp3(a.look, b.look, k),
        fov: lerp(a.fov ?? 45, b.fov ?? 45, k),
      };
    }
  }
  return keys[keys.length - 1];
}

export const Cam = ({ keys, t, shake = 0 }: { keys: CamKey[]; t: number; shake?: number }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const c = camAt(keys, t);
  useLayoutEffect(() => {
    const sx = Math.sin(t * 73) * shake;
    const sy = Math.cos(t * 61) * shake;
    camera.position.set(c.pos[0] + sx, c.pos[1] + sy, c.pos[2]);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);
    camera.fov = c.fov ?? 45;
    camera.updateProjectionMatrix();
  }, [camera, c, t, shake]);
  return null;
};

/** Image-based light from three's RoomEnvironment: soft colourful
 * reflections everywhere, no HDR file to load. */
const Env = ({ intensity }: { intensity: number }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    room.dispose();
    pmrem.dispose();
    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, scene]);
  useLayoutEffect(() => {
    scene.environmentIntensity = intensity;
  }, [scene, intensity]);
  return null;
};

export const Scene3D = ({
  children,
  background = "#0c1512",
  env = 0.6,
}: {
  children: ReactNode;
  background?: string;
  env?: number;
}) => {
  const { width, height } = useVideoConfig();
  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: 45, near: 0.1, far: 900, position: [0, 2, 8] }}
      // A logarithmic depth buffer keeps close-up faces and far skylines
      // in the same shot free of z-fighting.
      gl={{ antialias: true, logarithmicDepthBuffer: true }}
      style={{ background }}
    >
      <Env intensity={env} />
      {children}
    </ThreeCanvas>
  );
};

/** A texture drawn with the 2D canvas API, rebuilt when `key` changes. */
export function useCanvasTexture(
  w: number,
  h: number,
  key: string,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    draw(ctx, w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, key]);
  useLayoutEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Deterministic pseudo-random 0..1. */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Parabolic hop from a to b, k in 0..1. */
export const arc = (a: V3, b: V3, k: number, height = 1): V3 => {
  const p = lerp3(a, b, k);
  return [p[0], p[1] + Math.sin(Math.PI * k) * height, p[2]];
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 between two times, smoothed. */
export const seg = (t: number, from: number, to: number) =>
  smooth(clamp01((t - from) / (to - from)));
