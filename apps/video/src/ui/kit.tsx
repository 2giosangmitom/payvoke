import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  Blocks,
  ChevronRight,
  CircleUserRound,
  House,
  KeyRound,
  MessagesSquare,
  Store,
  Wallet,
} from "lucide-react";
import { mono, sans, T } from "../lib/theme";

// Mock pieces of the real Payvoke console, at video scale (about 1.5x the
// web sizes). Square corners, quiet green borders, colour on data only.

export const Logo = ({ size = 40, style }: { size?: number; style?: CSSProperties }) => (
  <svg viewBox="0 0 28 28" width={size} height={size} style={style} aria-hidden>
    <g transform="rotate(-8 14 14)" fill={T.logo}>
      <path d="M3 3h6v6H3zM19 3h6v6h-6zM3 19h6v6H3zM19 19h6v6h-6z" />
      <path d="M11 3h6v6h-6zM3 11h6v6H3zM19 11h6v6h-6zM11 19h6v6h-6z" opacity=".18" />
      <path d="M11 11h6v6h-6z" fill={T.logoLight} />
    </g>
  </svg>
);

export const Wordmark = ({ size = 28 }: { size?: number }) => (
  <span
    style={{
      fontFamily: sans,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: "-0.065em",
      color: T.text,
    }}
  >
    payvoke<span style={{ color: T.brand }}>.</span>
  </span>
);

export const Mono = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <span style={{ fontFamily: mono, fontVariantNumeric: "tabular-nums", ...style }}>{children}</span>
);

export const Panel = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      background: T.surface,
      border: `1.5px solid ${T.border}`,
      color: T.text,
      fontFamily: sans,
      ...style,
    }}
  >
    {children}
  </div>
);

export const Button = ({
  children,
  variant = "primary",
  pressed = 0,
  style,
}: {
  children: ReactNode;
  variant?: "primary" | "ghost" | "outline";
  /** 0..1, how far the click has pushed it in. */
  pressed?: number;
  style?: CSSProperties;
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 10,
      height: 52,
      padding: "0 22px",
      fontFamily: sans,
      fontWeight: 500,
      fontSize: 21,
      background: variant === "primary" ? T.brand : "transparent",
      color: variant === "primary" ? T.brandInk : T.text,
      border: variant === "outline" ? `1.5px solid ${T.borderStrong}` : "1.5px solid transparent",
      scale: 1 - pressed * 0.06,
      filter: `brightness(${1 + pressed * 0.25})`,
      ...style,
    }}
  >
    {children}
  </span>
);

export const Pill = ({
  children,
  tone = "brand",
}: {
  children: ReactNode;
  tone?: "brand" | "warning" | "danger" | "muted";
}) => {
  const colors = {
    brand: [T.brandSoft, T.brand],
    warning: ["#3d3221", T.warning],
    danger: [T.dangerSoft, T.danger],
    muted: [T.surface2, T.text2],
  }[tone];
  return (
    <span
      style={{
        background: colors[0],
        color: colors[1],
        fontSize: 18,
        padding: "4px 12px",
        fontFamily: sans,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};

export const Avatar = ({
  name,
  size = 60,
  image,
}: {
  name: string;
  size?: number;
  image?: string;
}) => (
  <span
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: T.brandSoft,
      color: T.brand,
      fontFamily: sans,
      fontWeight: 600,
      fontSize: size * 0.45,
    }}
  >
    {image ?? name.charAt(0).toUpperCase()}
  </span>
);

const RAIL = [House, MessagesSquare, Activity, Wallet, KeyRound, null, Blocks, CircleUserRound];

/** The signed-in console: icon rail, 48px top bar with breadcrumb, the page. */
export const ConsoleFrame = ({
  section,
  active,
  children,
  style,
}: {
  section: string;
  /** Index into the rail of the open screen. */
  active: number;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "84px 1fr",
      background: T.bg,
      border: `1.5px solid ${T.border}`,
      boxShadow: "0 40px 120px #030b07cc, 0 0 0 1px #030b07",
      fontFamily: sans,
      color: T.text,
      overflow: "hidden",
      ...style,
    }}
  >
    <div
      style={{
        borderRight: `1.5px solid ${T.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 26,
        paddingTop: 18,
      }}
    >
      <Logo size={36} />
      <div style={{ height: 8 }} />
      {RAIL.map((Icon, i) =>
        Icon ? (
          <span key={i} style={{ position: "relative", color: i === active ? T.text : T.muted }}>
            <Icon size={30} strokeWidth={1.5} />
            {i === active && (
              <span
                style={{
                  position: "absolute",
                  right: -27,
                  top: -4,
                  bottom: -4,
                  width: 1.5,
                  background: T.brand,
                }}
              />
            )}
          </span>
        ) : (
          <span key={i} style={{ width: 28, height: 1.5, background: T.border }} />
        ),
      )}
      <span style={{ marginTop: "auto", marginBottom: 22, color: T.muted }}>
        <Store size={30} strokeWidth={1.5} />
      </span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div
        style={{
          height: 72,
          borderBottom: `1.5px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 28px",
          fontSize: 21,
          color: T.muted,
        }}
      >
        Console <ChevronRight size={20} /> <span style={{ color: T.text }}>{section}</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              width: 14,
              height: 14,
              background: T.avalanche,
              clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
            }}
          />
          <Mono style={{ color: T.text2, fontSize: 19 }}>0x7a3e…f19c</Mono>
        </span>
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>{children}</div>
    </div>
  </div>
);

/** A mouse pointer. */
export const Cursor = ({ x, y, click = 0 }: { x: number; y: number; click?: number }) => (
  <div style={{ position: "absolute", left: x, top: y, pointerEvents: "none" }}>
    {click > 0 && (
      <span
        style={{
          position: "absolute",
          left: -40 * click,
          top: -40 * click,
          width: 80 * click,
          height: 80 * click,
          borderRadius: "50%",
          border: `3px solid ${T.brand}`,
          opacity: 1 - click,
        }}
      />
    )}
    <svg
      width={38}
      height={38}
      viewBox="0 0 24 24"
      style={{ filter: "drop-shadow(0 4px 8px #0008)" }}
    >
      <path
        d="M4 2l16 10-7 1.5L9.5 21z"
        fill={T.text}
        stroke={T.bgDeep}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  </div>
);

/** Avalanche's mark: a red disc with a white peak and a small one. */
export const AvalancheMark = ({ size = 60 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-label="Avalanche">
    <circle cx={50} cy={50} r={50} fill={T.avalanche} />
    <path d="M44 24 L20 72 H44 L54 54 Z" fill="#fff" />
    <path d="M62 50 L48 74 H76 Z" fill="#fff" />
  </svg>
);

/** Full-screen backdrop for the real UI cut-aways: we are "inside" his laptop. */
export const ScreenFrame = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      background: `radial-gradient(ellipse at 50% 40%, ${T.bg} 0%, ${T.bgDeep} 70%, #050807 100%)`,
    }}
  >
    {children}
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "repeating-linear-gradient(0deg, #00000012 0 2px, transparent 2px 4px)",
        pointerEvents: "none",
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        boxShadow: "inset 0 0 160px #000c",
        pointerEvents: "none",
      }}
    />
  </div>
);
