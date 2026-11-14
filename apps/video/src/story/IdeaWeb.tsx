import { AbsoluteFill, interpolate } from "remotion";
import { ramp, useLocal } from "../lib/motion";
import { T, viet } from "../lib/theme";
import { Logo } from "../ui/kit";

// The plaza's big screen at 2:50: not a shop window, but the story of the
// whole town. Each friend's tool appears, then the jobs flow between them:
// Chiến's Jingle Bot hires Huỳnh Đức Khánh's Logo Smith, Minh Thư hires Toàn
// Lê's Tax Goblin... Every line is one job, paid per job over x402.

type Node = {
  id: string;
  who: string;
  tool: string;
  icon: string;
  x: number;
  y: number;
  at: number;
};
export const WEB: Node[] = [
  { id: "jingle", who: "Võ Quang Chiến", tool: "Jingle Bot", icon: "🎷", x: 960, y: 470, at: 0.2 },
  { id: "logo", who: "Huỳnh Đức Khánh", tool: "Logo Smith", icon: "🎨", x: 1420, y: 300, at: 0.6 },
  { id: "bug", who: "Nhật Đoàn", tool: "Bug Whisperer", icon: "🐞", x: 480, y: 300, at: 0.9 },
  { id: "tax", who: "Toàn Lê", tool: "Tax Goblin", icon: "🧾", x: 470, y: 690, at: 1.2 },
  { id: "pixel", who: "Khánh Quân", tool: "Pixel Cat", icon: "🐱", x: 1440, y: 700, at: 1.5 },
  {
    id: "csv",
    who: "Thành Nhân Premium",
    tool: "CSV Analyst",
    icon: "📊",
    x: 960,
    y: 840,
    at: 1.8,
  },
];
/** People hiring tools (outer ring). */
type User = { who: string; x: number; y: number };
const USERS: User[] = [
  { who: "Bà Diễm Xoan", x: 960, y: 150 },
  { who: "Minh Thư", x: 170, y: 520 },
  { who: "Quỳnh Như", x: 230, y: 860 },
  { who: "Mỹy Hạnh", x: 1720, y: 520 },
  { who: "Huỳnh Văn Sinh", x: 1690, y: 880 },
];
type Edge = { from: string; to: string; at: number };
/** Who hired whom: a tool id, or a user name. */
const EDGES: Edge[] = [
  { from: "Bà Diễm Xoan", to: "jingle", at: 2.1 },
  { from: "jingle", to: "logo", at: 2.5 },
  { from: "Minh Thư", to: "tax", at: 2.8 },
  { from: "Quỳnh Như", to: "bug", at: 3.1 },
  { from: "bug", to: "csv", at: 3.4 },
  { from: "Mỹy Hạnh", to: "jingle", at: 3.7 },
  { from: "logo", to: "pixel", at: 4.0 },
  { from: "Huỳnh Văn Sinh", to: "csv", at: 4.3 },
  { from: "tax", to: "csv", at: 4.6 },
];

const where = (id: string): [number, number] => {
  const n = WEB.find((x) => x.id === id);
  if (n) return [n.x, n.y];
  const u = USERS.find((x) => x.who === id)!;
  return [u.x, u.y];
};

export const IdeaWeb = () => {
  const { t } = useLocal();
  const jobs = Math.round(
    interpolate(t, [2, 6], [0, 12480], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
  );
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 50%, ${T.surface} 0%, ${T.bgDeep} 75%)`,
        fontFamily: viet,
        color: T.text,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 50,
          top: 36,
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Logo size={46} />
        <span style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-0.02em" }}>
          One little idea, passed around the whole town
        </span>
      </div>
      <div style={{ position: "absolute", right: 50, top: 40, textAlign: "right" }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: T.brand }}>
          {jobs.toLocaleString("en-US")}
        </div>
        <div style={{ fontSize: 20, color: T.muted }}>jobs paid today</div>
      </div>
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
        {EDGES.map((e, i) => {
          const k = ramp(t, e.at, e.at + 0.6);
          if (k <= 0) return null;
          const [x1, y1] = where(e.from);
          const [x2, y2] = where(e.to);
          const x = x1 + (x2 - x1) * k;
          const y = y1 + (y2 - y1) * k;
          // a coin travels each new line, then keeps pulsing along it
          const loop = ((t - e.at) * 0.6) % 1;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x}
                y2={y}
                stroke={T.brand}
                strokeWidth={4}
                strokeOpacity={0.75}
                strokeDasharray="10 8"
              />
              {k >= 1 && (
                <circle
                  cx={x1 + (x2 - x1) * loop}
                  cy={y1 + (y2 - y1) * loop}
                  r={9}
                  fill={T.sunset}
                />
              )}
            </g>
          );
        })}
      </svg>
      {USERS.map((u) => {
        const k = ramp(t, 1.9, 2.3);
        return (
          <div
            key={u.who}
            style={{
              position: "absolute",
              left: u.x,
              top: u.y,
              translate: "-50% -50%",
              opacity: k,
              padding: "8px 18px",
              borderRadius: 999,
              background: "#ffffff14",
              border: `2px solid ${T.border}`,
              fontSize: 24,
              fontWeight: 600,
            }}
          >
            {u.who}
          </div>
        );
      })}
      {WEB.map((n) => {
        const k = ramp(t, n.at, n.at + 0.4);
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: n.x,
              top: n.y,
              translate: "-50% -50%",
              scale: 0.6 + k * 0.4,
              opacity: k,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "14px 22px",
              background: T.bg,
              border: `2.5px solid ${n.id === "jingle" ? T.sunset : T.brand}`,
              borderRadius: 18,
              boxShadow: "0 10px 30px #0009",
            }}
          >
            <span style={{ fontSize: 44 }}>{n.icon}</span>
            <span style={{ display: "grid" }}>
              <span style={{ fontSize: 30, fontWeight: 800 }}>{n.tool}</span>
              <span style={{ fontSize: 20, color: T.logoLight }}>by {n.who}</span>
            </span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
