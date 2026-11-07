import { useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { T } from "../lib/theme";
import { drawBubble, drawNote, drawScreen, type Screen } from "./screens";
import { NameTag } from "./nametag";
import { rand, useCanvasTexture, type V3 } from "./stage";

// The physical world of the video. Units are roughly metres.

/* ---------- the idea ---------- */

export const IdeaCube = ({
  position = [0, 0, 0],
  size = 0.22,
  t = 0,
  glow = 1,
  spin = 1,
  light = true,
}: {
  position?: V3;
  size?: number;
  t?: number;
  glow?: number;
  spin?: number;
  light?: boolean;
}) => (
  <group position={position} rotation={[t * 0.9 * spin, t * 1.3 * spin, 0.2]}>
    <mesh>
      <boxGeometry args={[size, size, size]} />
      <meshStandardMaterial
        color={T.logoLight}
        emissive={T.logoLight}
        emissiveIntensity={1.2 * glow}
        toneMapped={false}
      />
    </mesh>
    <mesh scale={1.6}>
      <boxGeometry args={[size, size, size]} />
      <meshBasicMaterial color={T.brand} transparent opacity={0.18 * glow} depthWrite={false} />
    </mesh>
    {light && glow > 0.05 && (
      <pointLight color={T.logoLight} intensity={4 * glow} distance={3} decay={1} />
    )}
  </group>
);

/** A thought bubble whose idea bounces around inside, unable to get out. */
export const ThoughtBubble = ({
  t,
  stuck = true,
  scale = 1,
}: {
  t: number;
  stuck?: boolean;
  scale?: number;
}) => {
  const r = 0.42;
  // Bounce off the inside of the bubble.
  const bx = Math.sin(t * 5.3) * r * 0.55;
  const by = Math.cos(t * 4.1) * r * 0.45;
  const squash = stuck ? 1 + Math.abs(Math.sin(t * 5.3)) * 0.06 : 1;
  return (
    <group scale={scale}>
      {[0.07, 0.1].map((s, i) => (
        <mesh key={i} position={[0.18 + i * 0.12, 0.05 + i * 0.16, 0]}>
          <sphereGeometry args={[s, 14, 12]} />
          <meshStandardMaterial color="#f6f5ea" transparent opacity={0.85} />
        </mesh>
      ))}
      <mesh position={[0.45, 0.75, 0]} scale={[squash, 1 / squash, 1]}>
        <sphereGeometry args={[r, 28, 20]} />
        <meshStandardMaterial
          color="#f6f5ea"
          transparent
          opacity={0.28}
          roughness={0.2}
          depthWrite={false}
        />
      </mesh>
      <IdeaCube position={[0.45 + bx, 0.75 + by, 0]} size={0.18} t={t} />
    </group>
  );
};

/* ---------- sky ---------- */

export const Sky = ({
  top,
  bottom,
  horizon,
}: {
  top: string;
  bottom: string;
  horizon?: string;
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color() },
          bottom: { value: new THREE.Color() },
          horizon: { value: new THREE.Color() },
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 horizon; varying vec3 vPos;
          void main(){ float h = vPos.y; vec3 c = h > 0.0 ? mix(horizon, top, smoothstep(0.0, 0.55, h)) : mix(horizon, bottom, smoothstep(0.0, 0.2, -h)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    [],
  );
  material.uniforms.top.value.set(top);
  material.uniforms.bottom.value.set(bottom);
  material.uniforms.horizon.value.set(horizon ?? bottom);
  return (
    <mesh material={material} renderOrder={-10}>
      <sphereGeometry args={[400, 32, 16]} />
    </mesh>
  );
};

export const Stars = ({ opacity = 1, count = 700 }: { opacity?: number; count?: number }) => {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = rand(i) * Math.PI * 2;
      const e = 0.08 + rand(i + 99) * 1.2;
      arr.set(
        [Math.cos(a) * Math.cos(e) * 350, Math.sin(e) * 350, Math.sin(a) * Math.cos(e) * 350],
        i * 3,
      );
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, [count]);
  if (opacity <= 0.01) return null;
  return (
    <points geometry={geometry}>
      <pointsMaterial
        fog={false}
        color="#fffbe8"
        size={1.6}
        sizeAttenuation={false}
        transparent
        opacity={opacity}
      />
    </points>
  );
};

export const Moon = ({ position, opacity = 1 }: { position: V3; opacity?: number }) => (
  <group position={position}>
    <mesh>
      <sphereGeometry args={[9, 32, 24]} />
      <meshBasicMaterial color="#eef3d8" transparent opacity={opacity} fog={false} />
    </mesh>
    <mesh scale={1.8}>
      <sphereGeometry args={[9, 24, 16]} />
      <meshBasicMaterial
        color="#bcd6cb"
        transparent
        opacity={0.08 * opacity}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  </group>
);

/** The striped synthwave sun, a nod to the music. */
export const SynthSun = ({
  position,
  size = 60,
  phase = 0,
  opacity = 1,
}: {
  position: V3;
  size?: number;
  phase?: number;
  opacity?: number;
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          phase: { value: 0 },
          opacity: { value: 1 },
          a: { value: new THREE.Color(T.logoLight) },
          b: { value: new THREE.Color(T.sunset) },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform float phase; uniform float opacity; uniform vec3 a; uniform vec3 b; varying vec2 vUv;
          void main(){ vec2 p = vUv - 0.5; if (length(p) > 0.5) discard;
            float band = fract(vUv.y * 14.0 + phase); if (vUv.y < 0.55 && band < (1.0 - vUv.y) * 0.9) discard;
            gl_FragColor = vec4(mix(b, a, smoothstep(0.0, 1.0, vUv.y)), opacity); }`,
      }),
    [],
  );
  material.uniforms.phase.value = phase;
  material.uniforms.opacity.value = opacity;
  return (
    <mesh position={position} material={material} renderOrder={-5}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
};

/* ---------- the hero's room ---------- */

const NOTE_COLORS = ["#f7e27a", "#f4a6b8", "#9ee0c2", "#a8c8f4", "#f7c27a"];
const NOTE_TEXT = [
  "learn rust",
  "startup?",
  "teach cat to code",
  "fix printer",
  "app 4 mum's recipes",
  "read the docs",
  "AI does my taxes",
  "plant robot",
  "learn synth",
  "music video",
  "automate job",
  "new spreadsheet",
];

const Note = ({
  i,
  position,
  rotation,
  blow = 0,
}: {
  i: number;
  position: V3;
  rotation: V3;
  blow?: number;
}) => {
  // Blown off the wall: each note leaves a little after the one before.
  const k = Math.min(1, Math.max(0, blow * 1.8 - rand(i + 3) * 0.8));
  const side = position[0] > 0 ? 1 : -1;
  const tex = useCanvasTexture(256, 256, `note-${i}`, (ctx, w, h) =>
    drawNote(ctx, w, h, NOTE_TEXT[i % NOTE_TEXT.length], NOTE_COLORS[i % NOTE_COLORS.length]),
  );
  return (
    <mesh
      position={[
        position[0] + side * k * 2.5,
        position[1] - k * k * 1.6 + Math.sin(k * 6) * 0.2,
        position[2] + k * 2.2,
      ]}
      rotation={[rotation[0] + k * 5, rotation[1] + k * 3, rotation[2] + k * 6]}
    >
      <planeGeometry args={[0.22, 0.22]} />
      <meshStandardMaterial map={tex} side={THREE.DoubleSide} />
    </mesh>
  );
};

/** Where sticky note i sits on the back wall around the window. */
export function notePlace(i: number): { position: V3; rotation: V3 } {
  const side = i % 2 ? 1 : -1;
  const x = side * (1.05 + rand(i) * 1.75);
  const y = 0.95 + rand(i + 50) * 1.85;
  return { position: [x, y, -2.43], rotation: [0, 0, (rand(i + 7) - 0.5) * 0.5] };
}

/** His laptop: a chunky one, so the screen reads on camera. Screen faces +z. */
export const Monitor = ({
  screen,
  screenKey,
  position = [0, 0.755, -2.0],
  glow = 1,
}: {
  screen: Screen;
  screenKey: string;
  position?: V3;
  glow?: number;
}) => {
  const tex = useCanvasTexture(800, 500, screenKey, (ctx, w, h) => drawScreen(ctx, w, h, screen));
  const lightColor =
    screen.kind === "error" ? "#ff5a5a" : screen.kind === "ok" ? T.brand : "#a9d8ff";
  return (
    <group position={position}>
      <mesh position={[0, 0.0125, 0]}>
        <boxGeometry args={[0.76, 0.025, 0.46]} />
        <meshStandardMaterial color="#9aa3a8" metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.033, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.66, 0.24]} />
        <meshStandardMaterial color="#2a2d30" />
      </mesh>
      {/* the lid hinges on the back edge and leans back a little */}
      <group position={[0, 0.025, -0.22]} rotation={[-0.22, 0, 0]}>
        <mesh position={[0, 0.235, -0.012]}>
          <boxGeometry args={[0.76, 0.47, 0.022]} />
          <meshStandardMaterial color="#9aa3a8" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.235, 0.0]}>
          <planeGeometry args={[0.7, 0.42]} />
          <meshBasicMaterial map={tex} toneMapped={false} />
        </mesh>
        {/* a glowing logo on the back of the lid */}
        <mesh position={[0, 0.25, -0.024]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.08, 0.08]} />
          <meshBasicMaterial color={T.logoLight} toneMapped={false} />
        </mesh>
      </group>
      {screen.kind !== "off" && (
        <pointLight
          position={[0, 0.3, 0.45]}
          color={lightColor}
          intensity={5 * glow}
          distance={3}
          decay={1}
        />
      )}
    </group>
  );
};

export const WallClock = ({
  position,
  hours,
  minutes,
}: {
  position: V3;
  hours: number;
  minutes: number;
}) => (
  <group position={position}>
    <mesh rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.28, 0.28, 0.04, 32]} />
      <meshStandardMaterial color="#f3efe0" />
    </mesh>
    <mesh position={[0, 0, -0.01]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.31, 0.31, 0.03, 32]} />
      <meshStandardMaterial color="#2a2a2a" />
    </mesh>
    {[
      [hours * (Math.PI / 6) + minutes * (Math.PI / 360), 0.14, 0.03],
      [minutes * (Math.PI / 30), 0.22, 0.02],
    ].map(([a, len, w], i) => (
      <mesh
        key={i}
        position={[Math.sin(a) * len * 0.5, Math.cos(a) * len * 0.5, 0.03 + i * 0.005]}
        rotation={[0, 0, -a]}
      >
        <boxGeometry args={[w, len, 0.01]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
    ))}
  </group>
);

const Mug = ({ position }: { position: V3 }) => (
  <group position={position}>
    <mesh position={[0, 0.06, 0]}>
      <cylinderGeometry args={[0.045, 0.04, 0.12, 14]} />
      <meshStandardMaterial color="#f3efe0" />
    </mesh>
    <mesh position={[0.05, 0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
      <torusGeometry args={[0.03, 0.009, 6, 12]} />
      <meshStandardMaterial color="#f3efe0" />
    </mesh>
  </group>
);

export type RoomProps = {
  t: number;
  screen: Screen;
  screenKey: string;
  /** 0 night, 1 morning */
  day?: number;
  notes?: number;
  /** 0..1, notes flying off the wall */
  blow?: number;
  mugs?: number;
  clock?: [number, number];
  windowOpen?: number;
  lamp?: number;
  /** Adds the wall you would otherwise be looking through. */
  closed?: boolean;
  children?: ReactNode;
};

/**
 * A bedroom. The desk sits under the window on the back wall (z = -2.5),
 * so from the street you see his face over the monitor. Bed on the right.
 */
export const Room = ({
  t,
  screen,
  screenKey,
  day = 0,
  notes = 0,
  blow = 0,
  mugs = 1,
  clock = [3, 47],
  windowOpen = 0,
  lamp = 1,
  closed = false,
  children,
}: RoomProps) => {
  const wall = new THREE.Color("#2c3d4f").lerp(new THREE.Color("#c9d6c4"), day).getStyle();
  const floor = "#6b4a33";
  const W = 1.6;
  const H = 1.1;
  const WY = 1.75;
  return (
    <group>
      <ambientLight intensity={0.55 + day * 0.55} color={day > 0.5 ? "#fff4e0" : "#9fb0d8"} />
      {day > 0.01 && (
        <directionalLight position={[0, 4, -8]} intensity={2.4 * day} color="#ffdcae" />
      )}
      {lamp > 0.01 && (
        <pointLight
          position={[-0.55, 1.4, -1.7]}
          color="#ffb860"
          intensity={14 * lamp}
          distance={9}
          decay={1}
        />
      )}
      <pointLight position={[0.5, 2.6, 1]} color="#8ea2c8" intensity={4} distance={8} decay={1} />
      {/* floor + rug */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial color={floor} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.3, 0.012, 0.2]}>
        <circleGeometry args={[1.1, 32]} />
        <meshStandardMaterial color="#3f7d63" roughness={1} />
      </mesh>
      {/* back wall with a window hole */}
      <group position={[0, 0, -2.5]}>
        <mesh position={[0, (WY - H / 2) / 2, 0]}>
          <boxGeometry args={[6, WY - H / 2, 0.1]} />
          <meshStandardMaterial color={wall} />
        </mesh>
        <mesh position={[0, (3 + WY + H / 2) / 2, 0]}>
          <boxGeometry args={[6, 3 - WY - H / 2, 0.1]} />
          <meshStandardMaterial color={wall} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 + (3 - W / 2) / 2), WY, 0]}>
            <boxGeometry args={[3 - W / 2, H, 0.1]} />
            <meshStandardMaterial color={wall} />
          </mesh>
        ))}
        {/* frame + sashes that swing open */}
        <mesh position={[0, WY - H / 2 - 0.04, 0.08]}>
          <boxGeometry args={[W + 0.2, 0.06, 0.18]} />
          <meshStandardMaterial color="#e9e4d4" />
        </mesh>
        {[-1, 1].map((s) => (
          <group key={s} position={[(s * W) / 2, WY, 0]} rotation={[0, s * windowOpen * 1.35, 0]}>
            <mesh position={[(-s * W) / 4, 0, 0]}>
              <boxGeometry args={[W / 2, H, 0.03]} />
              <meshStandardMaterial color="#cfe6ff" transparent opacity={0.12} depthWrite={false} />
            </mesh>
            <mesh position={[(-s * W) / 4, 0, 0]}>
              <boxGeometry args={[W / 2, 0.04, 0.05]} />
              <meshStandardMaterial color="#e9e4d4" />
            </mesh>
            <mesh position={[-s * 0.02, 0, 0]}>
              <boxGeometry args={[0.04, H, 0.05]} />
              <meshStandardMaterial color="#e9e4d4" />
            </mesh>
          </group>
        ))}
      </group>
      {/* side walls */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3, 1.5, 0]}>
          <boxGeometry args={[0.1, 3, 5]} />
          <meshStandardMaterial color={wall} />
        </mesh>
      ))}
      {/* ceiling */}
      <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 5]} />
        <meshStandardMaterial color={wall} />
      </mesh>
      {closed && (
        <mesh position={[0, 1.5, 2.5]}>
          <boxGeometry args={[6, 3, 0.1]} />
          <meshStandardMaterial color={wall} />
        </mesh>
      )}
      {/* desk */}
      <group position={[0, 0, -2.1]}>
        <mesh position={[0, 0.73, 0]}>
          <boxGeometry args={[2, 0.05, 0.75]} />
          <meshStandardMaterial color="#8a6040" />
        </mesh>
        {[-0.95, 0.95].map((x) => (
          <mesh key={x} position={[x, 0.36, 0]}>
            <boxGeometry args={[0.05, 0.72, 0.7]} />
            <meshStandardMaterial color="#6d4a30" />
          </mesh>
        ))}
        {/* lamp */}
        <group position={[-0.55, 0.75, 0.05]}>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.09, 0.1, 0.03, 16]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.45, 8]} />
            <meshStandardMaterial color="#2a2a2a" />
          </mesh>
          <mesh position={[0, 0.5, 0.04]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.12, 0.16, 16, 1, true]} />
            <meshStandardMaterial
              color="#e5bd83"
              emissive="#ffb860"
              emissiveIntensity={lamp * 0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
        {Array.from({ length: Math.min(mugs, 9) }, (_, i) => (
          <Mug
            key={i}
            position={[
              0.55 + (i % 3) * 0.13,
              0.755 + Math.floor(i / 3) * 0.12,
              -0.15 + (i % 2) * 0.1,
            ]}
          />
        ))}
      </group>
      <Monitor screen={screen} screenKey={screenKey} />
      {/* chair */}
      <group position={[0, 0, -1.35]}>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[0.55, 0.07, 0.5]} />
          <meshStandardMaterial color="#232e3a" />
        </mesh>
        <mesh position={[0, 0.85, 0.24]}>
          <boxGeometry args={[0.55, 0.7, 0.06]} />
          <meshStandardMaterial color="#232e3a" />
        </mesh>
        <mesh position={[0, 0.22, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
      {/* bed, unslept-in */}
      <group position={[2.05, 0, 0.6]}>
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[1.3, 0.4, 2.1]} />
          <meshStandardMaterial color="#5b3f2c" />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[1.2, 0.14, 2]} />
          <meshStandardMaterial color="#e8e4d8" />
        </mesh>
        <mesh position={[0, 0.56, -0.75]}>
          <boxGeometry args={[0.8, 0.12, 0.35]} />
          <meshStandardMaterial color="#f6f3ea" />
        </mesh>
        <mesh position={[0, 0.55, 0.3]} rotation={[0.05, 0, 0.02]}>
          <boxGeometry args={[1.24, 0.08, 1.3]} />
          <meshStandardMaterial color="#c0605a" />
        </mesh>
      </group>
      {/* shelf above the bed */}
      <mesh position={[2.3, 1.7, -2.35]}>
        <boxGeometry args={[1.1, 0.04, 0.25]} />
        <meshStandardMaterial color="#8a6040" />
      </mesh>
      <WallClock position={[-1.9, 2.35, -2.42]} hours={clock[0]} minutes={clock[1]} />
      {Array.from({ length: notes }, (_, i) => {
        const p = notePlace(i);
        return <Note key={i} i={i} {...p} blow={blow} />;
      })}
      {/* poster */}
      <mesh position={[-2.92, 1.7, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[0.9, 1.2]} />
        <meshStandardMaterial color="#1d3b2d" emissive={T.logo} emissiveIntensity={0.15} />
      </mesh>
      {children}
      {/* t is kept for children that animate with the room */}
      <group visible={false} userData={{ t }} />
    </group>
  );
};

/** The outside of the hero's house, wrapped around the Room. */
export const HouseShell = ({ siding = "#3b5163" }: { lit?: number; siding?: string }) => {
  const W = 1.6;
  const H = 1.1;
  const WY = 1.75;
  return (
    <group>
      <group position={[0, 0, -2.62]}>
        <mesh position={[0, (WY - H / 2) / 2, 0]}>
          <boxGeometry args={[6.4, WY - H / 2, 0.12]} />
          <meshStandardMaterial color={siding} />
        </mesh>
        <mesh position={[0, (3.2 + WY + H / 2) / 2, 0]}>
          <boxGeometry args={[6.4, 3.2 - WY - H / 2, 0.12]} />
          <meshStandardMaterial color={siding} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * (W / 2 + (3.2 - W / 2) / 2), WY, 0]}>
            <boxGeometry args={[3.2 - W / 2, H, 0.12]} />
            <meshStandardMaterial color={siding} />
          </mesh>
        ))}
        {/* green Huế shutters folded open beside the window */}
        {[-1, 1].map((s) => (
          <mesh key={`sh${s}`} position={[s * (W / 2 + 0.34), WY, -0.1]}>
            <boxGeometry args={[0.6, H + 0.1, 0.05]} />
            <meshStandardMaterial color="#2e7d5b" />
          </mesh>
        ))}
        {/* outer window trim and a little flower box */}
        <mesh position={[0, WY - H / 2 - 0.08, -0.15]}>
          <boxGeometry args={[W + 0.3, 0.16, 0.25]} />
          <meshStandardMaterial color="#7a4a32" />
        </mesh>
        {[-0.5, -0.2, 0.15, 0.45].map((x, i) => (
          <mesh key={x} position={[x, WY - H / 2 - 0.02, -0.18]}>
            <sphereGeometry args={[0.06, 10, 8]} />
            <meshStandardMaterial color={["#e85d75", "#f7c27a", "#e85d75", "#9ee0c2"][i]} />
          </mesh>
        ))}
      </group>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.14, 1.6, 0]}>
          <boxGeometry args={[0.12, 3.2, 5.36]} />
          <meshStandardMaterial color={siding} />
        </mesh>
      ))}
      <mesh position={[0, 1.6, 2.64]}>
        <boxGeometry args={[6.4, 3.2, 0.12]} />
        <meshStandardMaterial color={siding} />
      </mesh>
      <mesh position={[0, 3.1, 0]}>
        <boxGeometry args={[6.4, 0.1, 5.4]} />
        <meshStandardMaterial color={siding} />
      </mesh>
      {/* roof: a triangular prism along x */}
      <Roof position={[0, 3.15, 0]} w={7} d={6.2} h={2} color="#c45a3c" />
      <mesh position={[1.8, 4.6, 1]}>
        <boxGeometry args={[0.45, 1.2, 0.45]} />
        <meshStandardMaterial color="#6b5a4a" />
      </mesh>
    </group>
  );
};

/** A pitched roof: triangle (base `d`, height `h`) extruded along x by `w`. */
export const Roof = ({
  position,
  w,
  d,
  h,
  color,
}: {
  position: V3;
  w: number;
  d: number;
  h: number;
  color: string;
}) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    g.translate(0, 0, -w / 2);
    g.rotateY(Math.PI / 2);
    return g;
  }, [w, d, h]);
  return (
    <mesh position={position} geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.9} flatShading />
    </mesh>
  );
};

/** The hero's AI assistant: a small hovering robot with a screen face. */
export const Robot = ({
  position,
  rotation = 0,
  t,
  face = "happy",
  carry,
  scale = 1,
  name,
}: {
  position: V3;
  rotation?: number;
  t: number;
  face?: "happy" | "talk" | "wow";
  carry?: ReactNode;
  scale?: number;
  name?: string;
}) => {
  const bob = Math.sin(t * 6) * 0.05;
  return (
    <group
      position={[position[0], position[1] + bob * scale, position[2]]}
      rotation={[0, rotation, 0]}
      scale={scale}
    >
      {name && (
        <group position={[0, 0.25, 0]}>
          <NameTag name={name} />
        </group>
      )}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[0.42, 0.36, 0.34]} />
        <meshStandardMaterial color="#e8ecef" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[0.5, 0.36, 0.36]} />
        <meshStandardMaterial color="#e8ecef" metalness={0.2} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.72, 0.185]}>
        <planeGeometry args={[0.42, 0.26]} />
        <meshBasicMaterial color="#0d1b16" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * 0.1, 0.75, 0.19]}
          scale={[
            1,
            face === "wow" ? 1.4 : face === "talk" ? 0.6 + Math.abs(Math.sin(t * 12)) * 0.6 : 1,
            1,
          ]}
        >
          <circleGeometry args={[0.04, 12]} />
          <meshBasicMaterial color={T.brand} toneMapped={false} />
        </mesh>
      ))}
      <mesh position={[0, 0.66, 0.19]}>
        <planeGeometry
          args={[face === "talk" ? 0.1 + Math.abs(Math.sin(t * 15)) * 0.06 : 0.12, 0.02]}
        />
        <meshBasicMaterial color={T.brand} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.98, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.16, 6]} />
        <meshStandardMaterial color="#999" />
      </mesh>
      <mesh position={[0, 1.08, 0]}>
        <sphereGeometry args={[0.04, 10, 8]} />
        <meshBasicMaterial color={T.sunset} toneMapped={false} />
      </mesh>
      {/* jet glow */}
      <mesh position={[0, 0.1, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.1, 0.25 + Math.abs(Math.sin(t * 20)) * 0.1, 12]} />
        <meshBasicMaterial color="#ffb860" transparent opacity={0.8} toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.28, 0.4, 0.05]} rotation={[carry ? -1.2 : 0, 0, s * 0.3]}>
          <capsuleGeometry args={[0.035, 0.18, 4, 8]} />
          <meshStandardMaterial color="#c9d0d6" />
        </mesh>
      ))}
      {carry && <group position={[0, 0.38, 0.32]}>{carry}</group>}
    </group>
  );
};

export const Snail = ({ position, t }: { position: V3; t: number }) => (
  <group position={position} scale={0.55}>
    <mesh position={[0, 0.06, 0]} scale={[1.6 + Math.sin(t * 3) * 0.08, 0.5, 0.6]}>
      <sphereGeometry args={[0.15, 14, 10]} />
      <meshStandardMaterial color="#c9b58a" />
    </mesh>
    {/* a spiral shell: shrinking rings */}
    {[0, 1, 2].map((k) => (
      <mesh
        key={k}
        position={[-0.05 + k * 0.025, 0.22 + k * 0.01, 0.015 * k]}
        rotation={[0, 0, 0.2]}
      >
        <torusGeometry args={[0.1 - k * 0.032, 0.045 - k * 0.012, 10, 20]} />
        <meshStandardMaterial color={["#9c6a3a", "#c08850", "#e0b070"][k]} />
      </mesh>
    ))}
    {[-1, 1].map((s) => (
      <group key={s}>
        <mesh position={[0.24, 0.2, s * 0.05]} rotation={[0, 0, -0.3]}>
          <cylinderGeometry args={[0.012, 0.012, 0.16, 6]} />
          <meshStandardMaterial color="#c9b58a" />
        </mesh>
        <mesh position={[0.27, 0.28, s * 0.05]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color="#141414" />
        </mesh>
      </group>
    ))}
  </group>
);

export const Coin = ({ position, t, size = 0.18 }: { position: V3; t: number; size?: number }) => (
  <mesh position={position} rotation={[Math.PI / 2, 0, t * 6]}>
    <cylinderGeometry args={[size, size, size * 0.2, 24]} />
    <meshStandardMaterial
      color="#f2c14e"
      emissive="#f2a33a"
      emissiveIntensity={0.5}
      metalness={0.6}
      roughness={0.3}
    />
  </mesh>
);

/** A canvas-drawn bubble that always faces +z (keep the camera in front). */
export const Bubble = ({
  position,
  lines,
  w = 1.6,
  h = 0.9,
  mono,
  accent,
  scale = 1,
  rotation = 0,
}: {
  position: V3;
  lines: string[];
  w?: number;
  h?: number;
  mono?: boolean;
  accent?: boolean;
  scale?: number;
  rotation?: number;
}) => {
  const tex = useCanvasTexture(
    Math.round(w * 400),
    Math.round(h * 400),
    `bubble-${lines.join("|")}-${accent}`,
    (ctx, cw, ch) => drawBubble(ctx, cw, ch, lines, { mono, accent }),
  );
  if (scale <= 0.01) return null;
  return (
    <mesh position={position} scale={scale} rotation={[0, rotation, 0]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={tex}
        transparent
        toneMapped={false}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

/* ---------- celebration ---------- */

/** Fireworks: bursts at given times, deterministic. */
export const Fireworks = ({
  t,
  bursts,
}: {
  t: number;
  bursts: { at: number; pos: V3; color: string }[];
}) => {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(90 * 3), 3));
    return g;
  }, []);
  return (
    <group>
      {bursts.map((b, bi) => {
        const age = t - b.at;
        if (age < 0 || age > 2.2) return null;
        const g = geometry.clone();
        const arr = g.attributes.position.array as Float32Array;
        for (let i = 0; i < 90; i++) {
          const a = rand(i + bi * 7) * Math.PI * 2;
          const e = (rand(i * 3 + bi) - 0.5) * Math.PI;
          const sp = 5 + rand(i + bi * 13) * 2;
          const r = sp * (1 - Math.exp(-age * 2.2));
          arr[i * 3] = Math.cos(a) * Math.cos(e) * r;
          arr[i * 3 + 1] = Math.sin(e) * r - age * age * 0.8;
          arr[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
        }
        return (
          <points key={bi} geometry={g} position={b.pos}>
            <pointsMaterial
              color={b.color}
              size={4}
              sizeAttenuation={false}
              transparent
              opacity={Math.max(0, 1 - age / 2.2)}
              toneMapped={false}
            />
          </points>
        );
      })}
    </group>
  );
};

/** The Payvoke mark as nine cubes; `assemble` 0..1 flies them in. */
export const LogoCubes = ({
  position,
  scale = 1,
  assemble = 1,
  t,
  pulse = 0,
}: {
  position: V3;
  scale?: number;
  assemble?: number;
  t: number;
  pulse?: number;
}) => (
  <group
    position={position}
    scale={scale}
    rotation={[0.15, Math.sin(t * 0.5) * 0.3, (-8 * Math.PI) / 180]}
  >
    {Array.from({ length: 9 }, (_, i) => {
      const x = (i % 3) - 1;
      const y = Math.floor(i / 3) - 1;
      const core = i === 4;
      const corner = x !== 0 && y !== 0;
      const k = Math.min(1, Math.max(0, assemble * 1.6 - (i % 5) * 0.12));
      const fly = (1 - k) * 18;
      return (
        <mesh
          key={i}
          position={[
            x * 1.15 + (rand(i) - 0.5) * fly,
            y * 1.15 + (rand(i + 9) - 0.5) * fly,
            (core ? pulse * 0.6 : 0) + fly,
          ]}
          rotation={[(1 - k) * 4, (1 - k) * 3, 0]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={core ? T.logoLight : T.logo}
            emissive={core ? T.logoLight : T.logo}
            emissiveIntensity={core ? 0.9 + pulse : 0.35}
            transparent
            opacity={core || corner ? 1 : 0.3}
            toneMapped={false}
          />
        </mesh>
      );
    })}
  </group>
);

export const Vault = ({
  position,
  open = 0,
  dial = 0,
  children,
}: {
  position: V3;
  open?: number;
  dial?: number;
  children?: ReactNode;
}) => (
  <group position={position}>
    <mesh position={[0, 1.4, 0]}>
      <boxGeometry args={[2.8, 2.8, 2.4]} />
      <meshStandardMaterial color="#59646b" metalness={0.6} roughness={0.35} />
    </mesh>
    <mesh position={[0, 1.4, 1.2]}>
      <boxGeometry args={[2.2, 2.2, 0.05]} />
      <meshStandardMaterial color="#1a1f22" />
    </mesh>
    {children}
    {/* the door hinges on its left edge */}
    <group position={[-1.05, 1.4, 1.3]} rotation={[0, -open * 1.9, 0]}>
      <mesh position={[1.05, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[1.02, 1.02, 0.22, 40]} />
        <meshStandardMaterial color="#8d9aa2" metalness={0.8} roughness={0.25} />
      </mesh>
      <group position={[1.05, 0, 0.13]} rotation={[0, 0, dial]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.08, 24]} />
          <meshStandardMaterial color="#c9d2d8" metalness={0.8} roughness={0.2} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0, 0.06]} rotation={[0, 0, (i * Math.PI) / 3]}>
            <boxGeometry args={[0.9, 0.07, 0.07]} />
            <meshStandardMaterial color="#c9d2d8" metalness={0.8} />
          </mesh>
        ))}
      </group>
    </group>
  </group>
);

/** A snowy peak lit red from behind: Avalanche. */
export const Mountain = ({
  position,
  scale = 1,
  glow = 1,
}: {
  position: V3;
  scale?: number;
  glow?: number;
}) => (
  <group position={position} scale={scale}>
    <mesh position={[0, 10, 0]}>
      <coneGeometry args={[16, 20, 6]} />
      <meshStandardMaterial color="#3a3f4a" roughness={1} flatShading />
    </mesh>
    <mesh position={[0, 16.2, 0]}>
      <coneGeometry args={[6.1, 7.7, 6]} />
      <meshStandardMaterial
        color="#f3f5f8"
        roughness={0.8}
        flatShading
        emissive={T.avalanche}
        emissiveIntensity={0.35 * glow}
      />
    </mesh>
    <mesh position={[-12, 6, 4]}>
      <coneGeometry args={[9, 12, 6]} />
      <meshStandardMaterial color="#323843" roughness={1} flatShading />
    </mesh>
    <pointLight
      position={[0, 24, 14]}
      color={T.avalanche}
      intensity={60 * glow}
      distance={120}
      decay={1}
    />
  </group>
);

/** Little squares flung out from a point: sparks, confetti, coins of light. */
export const Burst = ({
  position,
  age,
  count = 40,
  colors = [T.brand, T.logoLight, "#f7e27a", "#f4a6b8"],
  speed = 2.5,
  size = 0.05,
  life = 1.6,
  seed = 1,
}: {
  position: V3;
  age: number;
  count?: number;
  colors?: string[];
  speed?: number;
  size?: number;
  life?: number;
  seed?: number;
}) => {
  if (age < 0 || age > life) return null;
  return (
    <group position={position}>
      {Array.from({ length: count }, (_, i) => {
        const a = rand(i + seed * 31) * Math.PI * 2;
        const up = 0.4 + rand(i * 7 + seed) * 0.9;
        const v = speed * (0.5 + rand(i * 3 + seed) * 0.8);
        const x = Math.cos(a) * v * age * 0.6;
        const z = Math.sin(a) * v * age * 0.6;
        const y = up * v * age - 2.2 * age * age;
        return (
          <mesh key={i} position={[x, y, z]} rotation={[age * 9 + i, age * 7, i]}>
            <boxGeometry args={[size, size, size * 0.3]} />
            <meshBasicMaterial
              color={colors[i % colors.length]}
              transparent
              opacity={1 - age / life}
              toneMapped={false}
            />
          </mesh>
        );
      })}
    </group>
  );
};

/** A glass jar for keeping an idea to yourself. */
export const Jar = ({ children }: { children?: ReactNode }) => (
  <group>
    <mesh>
      <cylinderGeometry args={[0.17, 0.17, 0.36, 24, 1, true]} />
      <meshStandardMaterial
        color="#cfe6ff"
        transparent
        opacity={0.25}
        roughness={0.1}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
    <mesh position={[0, 0.2, 0]}>
      <cylinderGeometry args={[0.18, 0.18, 0.06, 24]} />
      <meshStandardMaterial color="#c0605a" />
    </mesh>
    {children}
  </group>
);
