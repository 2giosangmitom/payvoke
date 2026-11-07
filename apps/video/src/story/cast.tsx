import type { ComponentProps } from "react";
import { Person, type Look } from "../three/person";
import type { V3 } from "../three/stage";

// The same faces in every scene.

export const HERO: Look = {
  shirt: "#3f7d63",
  pants: "#2b3445",
  hair: "#2b1d14",
  skin: "#f2c9a0",
  glasses: true,
};
export const NEIGHBOR: Look = {
  shirt: "#c0605a",
  pants: "#3a3550",
  hair: "#7a3b1d",
  skin: "#e0a77f",
  hat: "beanie",
  hatColor: "#e5bd83",
};
export const TOWN: Look[] = [
  {
    shirt: "#e5bd83",
    pants: "#3a4250",
    hair: "#111",
    skin: "#c68a5e",
    hat: "cap",
    hatColor: "#3f7d63",
  },
  { shirt: "#8f6bd1", pants: "#2b3445", hair: "#d9b26f", skin: "#f5d3b5" },
  {
    shirt: "#4a90c2",
    pants: "#5a4030",
    hair: "#3b2a1f",
    skin: "#8d5a3b",
    hat: "beret",
    hatColor: "#c0392b",
  },
  { shirt: "#ff7a59", pants: "#2b3445", hair: "#222", skin: "#f2c9a0", glasses: true },
  {
    shirt: "#9ee0c2",
    pants: "#33404d",
    hair: "#5a2e1a",
    skin: "#d9a07a",
    hat: "beanie",
    hatColor: "#4a90c2",
  },
  { shirt: "#f4a6b8", pants: "#2e2e3a", hair: "#121212", skin: "#a8714d" },
];

/** At his desk chair, facing the window (-z). */
export const DESK: V3 = [0, 0, -1.42];

export const HeroMan = ({
  position,
  rotation,
  ...props
}: Omit<ComponentProps<typeof Person>, "look">) => (
  <Person position={position ?? DESK} rotation={rotation ?? Math.PI} look={HERO} {...props} />
);
