import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { T } from "../lib/theme";
import { useCanvasTexture } from "./stage";

const FONT = '"Noto Sans", "DejaVu Sans", Arial, sans-serif';
const tmp = new THREE.Vector3();

/**
 * A name over someone's head, always facing the camera (a sprite). It is
 * drawn on top of everything, so a wall, an awning or another person never
 * hides it. `range` (metres) hides tags of people far from the camera, so
 * passers-by in the background never crowd the people talking. `lift`
 * raises a tag, for people standing shoulder to shoulder.
 */
export const NameTag = ({
  name,
  range = Infinity,
  lift = 0,
}: {
  name: string;
  range?: number;
  lift?: number;
}) => {
  const ref = useRef<THREE.Sprite>(null);
  const w = 512;
  const h = 112;
  const map = useCanvasTexture(w, h, `tag-${name}`, (ctx) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = `800 64px ${FONT}`;
    const bw = Math.min(w - 8, ctx.measureText(name).width + 64);
    const x0 = (w - bw) / 2;
    ctx.fillStyle = "rgba(12,21,18,0.88)";
    ctx.beginPath();
    ctx.roundRect(x0, 4, bw, h - 8, 26);
    ctx.fill();
    ctx.strokeStyle = T.brand;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(name, w / 2, 80, bw - 40);
  });
  // Runs on every rendered frame, after the camera has been placed.
  useFrame(({ camera }) => {
    const s = ref.current;
    if (!s) return;
    s.getWorldPosition(tmp);
    const d = tmp.distanceTo(camera.position);
    // too close and the tag would fill the screen; too far and it crowds
    s.visible = d > 2.6 && d < range;
    (s.material as THREE.SpriteMaterial).opacity = Math.min(1, (range - d) / 2, (d - 2.6) / 0.8);
  });
  return (
    <sprite
      ref={ref}
      position={[0, 1.02 + lift, 0]}
      scale={[1.15, (1.15 * h) / w, 1]}
      renderOrder={20}
    >
      <spriteMaterial
        map={map}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
        fog={false}
      />
    </sprite>
  );
};
