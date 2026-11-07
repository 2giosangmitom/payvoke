import { useId, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";

// Hand-drawn doodles for the feature cards. Ink is the text colour and the
// fills are theme tokens, so they read in light and dark. A still turbulence
// filter roughens every line a little, like a pen on paper; nothing moves.

const ink = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;
const soft = "var(--color-primary-soft)";
const jade = "var(--color-primary)";
const warm = "var(--color-warning)";
const red = "var(--color-avax)";

function Sketch({
  viewBox,
  className,
  roughness = 1.6,
  children,
}: {
  viewBox: string;
  className?: string;
  roughness?: number;
  children: ReactNode;
}) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      viewBox={viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn("overflow-visible text-foreground", className)}
    >
      <defs>
        <filter id={`pen-${id}`} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale={roughness} />
        </filter>
      </defs>
      <g filter={`url(#pen-${id})`}>{children}</g>
    </svg>
  );
}

/** A four-pointed sparkle centred on (x, y). */
function Sparkle({
  x,
  y,
  r = 7,
  color = warm,
}: {
  x: number;
  y: number;
  r?: number;
  color?: string;
}) {
  const k = r * 0.28;
  return (
    <path
      {...ink}
      strokeWidth={1.8}
      fill={color}
      d={`M${x} ${y - r} Q${x + k} ${y - k} ${x + r} ${y} Q${x + k} ${y + k} ${x} ${y + r} Q${x - k} ${y + k} ${x - r} ${y} Q${x - k} ${y - k} ${x} ${y - r}Z`}
    />
  );
}

/** The little agent every doodle shares: a round-cornered head, an antenna, a smile. */
function Bot({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* antenna */}
      <path {...ink} d="M0 -46 C1 -52 -1 -56 0 -60" />
      <circle {...ink} cx="0" cy="-63" r="4" fill={red} />
      {/* head */}
      <path
        {...ink}
        fill={soft}
        d="M-24 -44 C-12 -47 12 -47 24 -44 C27 -34 27 -18 24 -8 C12 -5 -12 -5 -24 -8 C-27 -18 -27 -34 -24 -44Z"
      />
      <circle cx="-9" cy="-27" r="3" fill="currentColor" />
      <circle cx="9" cy="-27" r="3" fill="currentColor" />
      <path {...ink} strokeWidth={1.9} d="M-7 -17 Q0 -12 7 -17" />
      <circle cx="-16" cy="-19" r="3" fill={red} opacity=".35" />
      <circle cx="16" cy="-19" r="3" fill={red} opacity=".35" />
      {/* body */}
      <path
        {...ink}
        fill={jade}
        d="M-17 -6 C-19 8 -18 22 -15 32 C-5 35 5 35 15 32 C18 22 19 8 17 -6"
      />
      <path {...ink} strokeWidth={1.6} d="M-6 8 h12" opacity=".7" />
    </g>
  );
}

/** A bot at its desk, handing over a paid receipt with a sparkle. */
export function DeskBot({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 260 190" className={className}>
      {/* floor */}
      <path {...ink} d="M12 176 C70 172 170 173 248 177" opacity=".55" />
      {/* desk */}
      <path
        {...ink}
        fill={soft}
        d="M96 120 C140 118 200 118 240 121 L238 130 C200 128 140 128 97 130Z"
      />
      <path {...ink} d="M108 130 C107 146 108 160 106 175 M228 130 C229 146 228 160 230 175" />
      {/* laptop */}
      <path
        {...ink}
        fill="var(--color-card)"
        d="M150 70 C170 68 196 68 214 70 L212 116 C192 117 170 117 152 116Z"
      />
      <path {...ink} d="M140 119 C166 117 198 117 226 119" />
      <path {...ink} strokeWidth={1.8} d="M162 84 l8 7 -8 7 M176 98 h14" stroke={jade} />
      {/* bot, on a stool */}
      <Bot x={72} y={128} scale={1.05} />
      <path {...ink} d="M54 164 C64 162 82 162 92 164 M60 164 L56 176 M86 164 L90 176" />
      {/* arm up, holding the receipt */}
      <path {...ink} d="M89 124 C100 110 104 98 110 86" />
      <path
        {...ink}
        fill="var(--color-card)"
        d="M100 40 C112 38 124 39 134 40 L133 86 L127 82 L121 87 L115 82 L109 87 L103 83 L100 86Z"
      />
      <path {...ink} strokeWidth={1.6} d="M107 52 h18 M107 61 h12" />
      <path {...ink} strokeWidth={2} stroke={jade} d="M108 71 l5 5 9 -10" />
      {/* the other arm on the desk */}
      <path {...ink} d="M56 124 C52 132 60 136 70 134" />
      {/* sparkles and a coin in the air */}
      <Sparkle x={150} y={30} r={9} />
      <Sparkle x={86} y={22} r={5} color={jade} />
      <circle {...ink} cx="176" cy="40" r="10" fill={warm} />
      <path
        {...ink}
        strokeWidth={1.7}
        d="M176 34 v12 M172.5 37.5 c0 -3 7 -3 7 0 s-7 2 -7 5 7 3 7 0"
      />
      <path {...ink} strokeWidth={1.5} d="M160 20 l4 -6 M190 26 l5 -4 M192 46 l6 1" opacity=".7" />
    </Sketch>
  );
}

/** A bot juggling a plug, a block and a pair of braces: any stack, any tool. */
export function JugglingBot({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 240 200" className={className}>
      <path {...ink} d="M30 188 C80 184 160 185 214 189" opacity=".55" />
      {/* juggling arcs */}
      <path
        {...ink}
        strokeWidth={1.6}
        strokeDasharray="2 7"
        d="M78 118 C64 60 104 26 120 24 C140 24 178 60 164 118"
        opacity=".7"
      />
      {/* bot */}
      <Bot x={121} y={152} scale={1.1} />
      <path {...ink} d="M107 189 C108 180 108 172 109 166 M134 166 C135 172 135 180 136 189" />
      <path {...ink} d="M102 136 C90 132 82 126 78 118 M140 136 C152 132 160 126 164 118" />
      {/* the plug */}
      <g transform="translate(66 54) rotate(-18)">
        <path {...ink} fill={soft} d="M-12 -10 C-4 -12 4 -12 12 -10 L11 8 C4 11 -4 11 -11 8Z" />
        <path {...ink} d="M-5 -10 v-9 M5 -10 v-9 M0 10 C0 18 6 20 4 27" />
      </g>
      {/* the block */}
      <g transform="translate(120 16) rotate(8)">
        <path {...ink} fill={jade} d="M-13 -9 L0 -16 L13 -9 L13 7 L0 14 L-13 7Z" />
        <path {...ink} strokeWidth={1.7} d="M-13 -9 L0 -2 L13 -9 M0 -2 V14" />
      </g>
      {/* the braces */}
      <g transform="translate(178 58) rotate(14)">
        <circle {...ink} r="16" fill="var(--color-card)" />
        <path
          {...ink}
          strokeWidth={2}
          stroke={jade}
          d="M-4 -8 C-8 -8 -7 -2 -9 0 C-7 2 -8 8 -4 8 M4 -8 C8 -8 7 -2 9 0 C7 2 8 8 4 8"
        />
      </g>
      <Sparkle x={36} y={96} r={7} />
      <Sparkle x={206} y={116} r={5} color={jade} />
      <path
        {...ink}
        fill={red}
        strokeWidth={1.6}
        d="M196 22 c-4 -6 -12 -1 -8 5 l8 8 8 -8 c4 -6 -4 -11 -8 -5Z"
      />
    </Sketch>
  );
}

/* Small marks, one per feature column (64×64). */

export function CoinMark({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 64 64" className={className} roughness={1.1}>
      <ellipse {...ink} cx="26" cy="46" rx="16" ry="6" fill={warm} />
      <path {...ink} d="M10 46 v-6 M42 46 v-6" />
      <ellipse {...ink} cx="26" cy="40" rx="16" ry="6" fill={warm} />
      <path {...ink} d="M10 40 v-6 M42 40 v-6" />
      <ellipse {...ink} cx="26" cy="34" rx="16" ry="6" fill={warm} />
      <path
        {...ink}
        fill="var(--color-card)"
        d="M34 8 C42 7 52 7 58 8 L58 24 C52 25 42 25 34 24Z"
      />
      <text
        x="46"
        y="19.5"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="9"
        fontWeight="600"
        fill={jade}
      >
        402
      </text>
      <path {...ink} strokeWidth={1.8} d="M38 24 C36 28 34 29 31 30" />
    </Sketch>
  );
}

export function PlugMark({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 64 64" className={className} roughness={1.1}>
      <path {...ink} fill={soft} d="M18 20 C26 18 34 18 42 20 L41 36 C34 40 26 40 19 36Z" />
      <path {...ink} d="M24 20 v-10 M36 20 v-10" />
      <path {...ink} d="M30 39 C30 48 22 48 22 54 C22 59 34 58 40 56" />
      <circle {...ink} cx="30" cy="28" r="3" fill={jade} />
      <Sparkle x={52} y={14} r={5} />
    </Sketch>
  );
}

export function FormMark({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 64 64" className={className} roughness={1.1}>
      <path
        {...ink}
        fill="var(--color-card)"
        d="M10 10 C24 9 38 9 50 10 L50 52 C38 53 24 53 10 52Z"
      />
      <path {...ink} strokeWidth={1.8} d="M17 19 h20 M17 28 h12" />
      <path {...ink} fill={soft} d="M17 36 h9 v9 h-9Z" />
      <path {...ink} stroke={jade} strokeWidth={2.4} d="M18.5 40 l3 3 5 -7" />
      <path {...ink} strokeWidth={1.8} d="M31 41 h11" />
      <path
        {...ink}
        fill="currentColor"
        strokeWidth={1.4}
        d="M44 38 L58 47 L52 48.5 L55 55 L52 56.5 L49 50 L45 54Z"
      />
    </Sketch>
  );
}

export function ChartMark({ className }: { className?: string }) {
  return (
    <Sketch viewBox="0 0 64 64" className={className} roughness={1.1}>
      <path
        {...ink}
        fill="var(--color-card)"
        d="M8 12 C24 11 40 11 56 12 L56 52 C40 53 24 53 8 52Z"
      />
      <path {...ink} fill={jade} d="M16 44 V32 h7 V44" />
      <path {...ink} fill={soft} d="M28 44 V22 h7 V44" />
      <path {...ink} fill={jade} d="M40 44 V27 h7 V44" />
      <path {...ink} strokeWidth={1.8} d="M13 45 C26 44 38 44 51 45" />
      <Sparkle x={52} y={10} r={6} />
    </Sketch>
  );
}
