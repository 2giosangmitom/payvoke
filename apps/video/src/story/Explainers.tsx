import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Blocks, Bot, Coins, KeyRound, MessagesSquare, ShieldCheck, Terminal } from "lucide-react";
import { ramp } from "../lib/motion";
import { mono, sans, T } from "../lib/theme";
import { AvalancheMark } from "../ui/kit";

// How Payvoke works, explained one card at a time while the story plays:
// a small card in the top-left corner, timed to the scene it explains.
// Times are song seconds (see MusicVideo.tsx).

export type Explainer = {
  from: number;
  to: number;
  icon: ReactNode;
  title: string;
  body: string;
  code?: string;
};

const ICON = { size: 30, strokeWidth: 1.8, color: T.brand };

/** The product, step by step, in story order. */
export const explainers = (m: {
  publish: number;
  chat: number;
  accept: number;
  errand: number;
  limit: number;
  earn: number;
  vault: number;
  avalanche: number;
}): Explainer[] => [
  {
    from: m.publish,
    to: m.publish + 3.2,
    icon: <Blocks {...ICON} />,
    title: "Share your agent in Studio",
    body: "Give it a name, its commands and a price cap, then publish it to the store.",
  },
  {
    from: m.chat,
    to: m.chat + 3.4,
    icon: <MessagesSquare {...ICON} />,
    title: "Chatting is free",
    body: "The agent can reply with text, a form, a few choices or a priced offer.",
  },
  {
    from: m.accept,
    to: m.accept + 2.6,
    icon: <Coins {...ICON} />,
    title: "Pay per job",
    body: "Accepting an offer signs a quote for that one job, paid over x402.",
  },
  {
    from: m.errand,
    to: m.errand + 3.6,
    icon: <Terminal {...ICON} />,
    title: "Your AI assistant can hire too",
    body: "With Payvoke's MCP server, Claude Code or Codex can find an agent, talk to it and pay.",
    code: "claude mcp add --transport http payvoke …/mcp",
  },
  {
    from: m.limit,
    to: m.limit + 3.4,
    icon: <KeyRound {...ICON} />,
    title: "Within your limits",
    body: "An API key pays with a spend key that has caps per job, per period and in total. It funds each job from the buyer's wallet and can never spend past them.",
  },
  {
    from: m.earn,
    to: m.earn + 3.4,
    icon: <Bot {...ICON} />,
    title: "Builders get paid per job",
    body: "The console charts what each of your agents earned, job by job.",
  },
  {
    from: m.vault,
    to: m.vault + 3.4,
    icon: <ShieldCheck {...ICON} />,
    title: "Held in the vault until the job ends",
    body: "If the work arrives on time the builder is paid. If not, the buyer gets a full refund.",
  },
  {
    from: m.avalanche,
    to: m.avalanche + 3,
    icon: <AvalancheMark size={30} />,
    title: "Settled on Avalanche",
    body: "The vault contract runs on Avalanche, so every payment is on chain.",
  },
];

export const Explainers = ({ items }: { items: Explainer[] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const e = items.find((x) => t >= x.from && t < x.to);
  if (!e) return null;
  const k = Math.min(ramp(t, e.from, e.from + 0.35), 1 - ramp(t, e.to - 0.35, e.to));
  return (
    <AbsoluteFill style={{ padding: 40, pointerEvents: "none" }}>
      <div
        style={{
          width: 560,
          display: "grid",
          gridTemplateColumns: "44px 1fr",
          columnGap: 16,
          rowGap: 8,
          padding: "20px 24px",
          background: "rgba(12,21,18,0.86)",
          border: `1.5px solid ${T.border}`,
          borderLeft: `4px solid ${T.brand}`,
          borderRadius: 14,
          boxShadow: "0 12px 40px #0009",
          fontFamily: sans,
          color: T.text,
          opacity: k,
          translate: `${(1 - k) * -30}px 0`,
        }}
      >
        <span style={{ gridRow: "span 2", paddingTop: 2 }}>{e.icon}</span>
        <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>{e.title}</span>
        <span style={{ fontSize: 20, color: T.text2, lineHeight: 1.35 }}>{e.body}</span>
        {e.code && (
          <span
            style={{
              gridColumn: "2",
              fontFamily: mono,
              fontSize: 16,
              color: T.brand,
              background: T.bgDeep,
              border: `1px solid ${T.border}`,
              padding: "8px 12px",
              borderRadius: 8,
              marginTop: 4,
            }}
          >
            $ {e.code}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
