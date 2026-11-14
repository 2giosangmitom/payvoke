import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate } from "remotion";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock,
  KeyRound,
  Search,
  ShieldCheck,
  Star,
} from "lucide-react";
import { inOut, pop, ramp, typed, useLocal } from "../lib/motion";
import { mono, sans, T } from "../lib/theme";
import { Avatar, Button, ConsoleFrame, Cursor, Mono, Panel, Pill } from "../ui/kit";
import { useOnScreen } from "../three/projector";

// Verse 2: the real console with mock data. The story follows one agent,
// Jingle Bot, from Studio to the store to its first paid job, then the
// buyer side: an AI assistant hiring another agent within an autopay limit.

const Frame = ({
  children,
  opacity,
  style,
}: {
  children: ReactNode;
  opacity: number;
  style?: CSSProperties;
}) => (
  <AbsoluteFill
    style={{
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 0,
      opacity,
      fontFamily: sans,
      color: T.text,
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Console window that tilts in from 3D space. */
const useTiltIn = () => {
  const { frame, fps, t, dur } = useLocal();
  const onScreen = useOnScreen();
  const p = pop(frame, fps, 0, 16);
  // On a 3D screen the UI simply is the screen: no tilt, no fade.
  if (onScreen) return { opacity: 1, style: {} as CSSProperties };
  return {
    opacity: inOut(t, dur, 0.25, 0.3),
    style: {
      transform: `perspective(2200px) rotateX(${(1 - p) * 18}deg) rotateY(${(1 - p) * -14}deg) translateY(${(1 - p) * 120}px)`,
    } as CSSProperties,
  };
};

const Field = ({ label, value, caret }: { label: string; value: string; caret?: boolean }) => (
  <label style={{ display: "grid", gap: 10 }}>
    <span style={{ fontSize: 20, color: T.text2 }}>{label}</span>
    <span
      style={{
        minHeight: 58,
        display: "flex",
        alignItems: "center",
        padding: "0 18px",
        border: `1.5px solid ${caret ? T.brand : T.borderStrong}`,
        fontSize: 24,
        background: T.bg,
      }}
    >
      {value}
      {caret && <span style={{ width: 2, height: 28, marginLeft: 2, background: T.brand }} />}
    </span>
  </label>
);

// "I gave it a name, put it up on Payvoke"
export const StudioPublish = () => {
  const { t, dur, frame, fps } = useLocal();
  const tilt = useTiltIn();
  const name = typed("Jingle Bot", t, 0.35, 14);
  const desc = typed("Writes a catchy jingle for anything you sell.", t, 1.1, 40);
  const clickAt = dur * 0.68;
  const click = t > clickAt ? ramp(t, clickAt, clickAt + 0.4) : 0;
  const live = pop(frame, fps, clickAt + 0.15);
  const cx = interpolate(ramp(t, dur * 0.4, clickAt), [0, 1], [1100, 1270]);
  const cy = interpolate(ramp(t, dur * 0.4, clickAt), [0, 1], [700, 640]);
  return (
    <Frame opacity={tilt.opacity}>
      <ConsoleFrame section="Studio" active={6} style={{ width: 1500, height: 780, ...tilt.style }}>
        <div style={{ padding: "40px 56px", display: "grid", gap: 30 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <Avatar name="J" size={72} image="🎷" />
            <div style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 40, fontWeight: 600, letterSpacing: "-0.03em" }}>
                {name || "Untitled app"}
              </span>
              <span style={{ fontSize: 20, color: T.muted }}>App info</span>
            </div>
            <span style={{ marginLeft: "auto" }}>
              {live > 0.05 ? <Pill>Live in the store</Pill> : <Pill tone="muted">Draft</Pill>}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28 }}>
            <Field label="Name" value={name} caret={t < 1.1} />
            <Field label="Category" value="Music & audio" />
          </div>
          <Field label="Description" value={desc} caret={t >= 1.1 && t < clickAt} />
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <Mono style={{ fontSize: 20, color: T.muted }}>/jingle · /lyrics · /mixdown</Mono>
            <span style={{ marginLeft: "auto" }} />
            <Button variant="ghost">Save draft</Button>
            <Button pressed={click > 0 ? 1 - click : 0}>
              Publish to store <ArrowRight size={22} />
            </Button>
          </div>
        </div>
        <Cursor x={cx} y={cy} click={click} />
      </ConsoleFrame>
      {/* Confetti of tiny jade squares on publish */}
      {Array.from({ length: 28 }, (_, i) => {
        const a = (i / 28) * Math.PI * 2;
        const d = live * (220 + (i % 5) * 60);
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              left: 1290 + Math.cos(a) * d,
              top: 690 + Math.sin(a) * d + live * live * 120,
              width: 14,
              height: 14,
              background: i % 3 ? T.brand : T.logoLight,
              opacity: (1 - ramp(t, clickAt + 0.5, clickAt + 1.4)) * (live > 0.02 ? 1 : 0),
              rotate: `${i * 40 + t * 200}deg`,
            }}
          />
        );
      })}
    </Frame>
  );
};

type Agent = {
  name: string;
  icon: string;
  owner: string;
  desc: string;
  rating: string;
  jobs: string;
  price: string;
  online?: boolean;
};

export const AGENTS: Agent[] = [
  {
    name: "Jingle Bot",
    icon: "🎷",
    owner: "0x7a3e…f19c",
    desc: "Writes a catchy jingle for anything you sell.",
    rating: "4.9",
    jobs: "1.2k",
    price: "up to $5 / job",
    online: true,
  },
  {
    name: "CSV Analyst",
    icon: "📊",
    owner: "0x19bd…44a0",
    desc: "Answers questions about your spreadsheet with charts.",
    rating: "4.8",
    jobs: "3.4k",
    price: "up to $2 / job",
    online: true,
  },
  {
    name: "Logo Smith",
    icon: "🔷",
    owner: "0xa0c2…9e11",
    desc: "Three logo directions and a palette in ten minutes.",
    rating: "4.7",
    jobs: "860",
    price: "up to $8 / job",
    online: true,
  },
  {
    name: "Bug Whisperer",
    icon: "🐞",
    owner: "0x55e1…07bd",
    desc: "Finds the bug, explains it, sends the patch.",
    rating: "4.9",
    jobs: "2.1k",
    price: "priced by offer",
    online: true,
  },
  {
    name: "Tax Goblin",
    icon: "🧾",
    owner: "0x0f4a…b2c8",
    desc: "Sorts receipts into a tidy tax-ready ledger.",
    rating: "4.6",
    jobs: "540",
    price: "up to $3 / job",
  },
  {
    name: "Pixel Cat",
    icon: "🐈",
    owner: "0x9b72…13fe",
    desc: "Turns your photo into 16-bit pixel art.",
    rating: "4.8",
    jobs: "4.8k",
    price: "up to $1 / job",
    online: true,
  },
];

export const AgentCard = ({
  agent,
  style,
  highlight,
}: {
  agent: Agent;
  style?: CSSProperties;
  highlight?: number;
}) => (
  <article
    style={{
      display: "flex",
      flexDirection: "column",
      background: T.surface,
      border: `1.5px solid ${highlight ? T.brand : T.border}`,
      boxShadow: highlight ? `0 0 ${50 * highlight}px ${T.brand}66` : undefined,
      fontFamily: sans,
      color: T.text,
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "24px 26px 0" }}>
      <Avatar name={agent.name} size={60} image={agent.icon} />
      <Pill tone={agent.online ? "brand" : "muted"}>{agent.online ? "Online" : "Away"}</Pill>
      <Star
        size={26}
        style={{ marginLeft: "auto" }}
        color={highlight ? T.brand : T.muted}
        fill={highlight ? T.brand : "none"}
      />
    </div>
    <div
      style={{ padding: "18px 26px 22px", flex: 1, display: "grid", gap: 8, alignContent: "start" }}
    >
      <span style={{ fontSize: 30, fontWeight: 500, letterSpacing: "-0.03em" }}>{agent.name}</span>
      <Mono style={{ fontSize: 17, color: T.muted }}>{agent.owner}</Mono>
      <span style={{ fontSize: 20, lineHeight: 1.45, color: T.text2 }}>{agent.desc}</span>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "14px 26px",
        borderTop: `1.5px solid ${T.border}`,
        fontSize: 19,
      }}
    >
      <span>
        <Star size={17} fill={T.warning} color={T.warning} /> <Mono>{agent.rating}</Mono>
      </span>
      <Mono style={{ color: T.muted }}>{agent.jobs} jobs</Mono>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 26px",
        borderTop: `1.5px solid ${T.border}`,
        fontFamily: mono,
        fontSize: 16,
      }}
    >
      <span style={{ color: T.muted }}>3 commands</span>
      <span style={{ color: T.brand }}>{agent.price}</span>
      <ArrowUpRight size={20} color={T.brand} />
    </div>
  </article>
);

/** The public store grid. Jingle Bot lands in the first slot. */
export const StoreGrid = ({ landAt = 0 }: { landAt?: number }) => {
  const { t, dur, frame, fps } = useLocal();
  const tilt = useTiltIn();
  return (
    <Frame opacity={tilt.opacity} style={{ paddingBottom: 0 }}>
      <div style={{ width: 1600, display: "grid", gap: 26, scale: 0.92, ...tilt.style }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 22, color: T.brand }}>Store</span>
            <span style={{ fontSize: 56, fontWeight: 600, letterSpacing: "-0.04em" }}>
              AI agents you can hire
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              width: 560,
              height: 62,
              padding: "0 20px",
              border: `1.5px solid ${T.borderStrong}`,
              background: T.bg,
              fontSize: 22,
              color: T.muted,
            }}
          >
            <Search size={24} /> Search by agent name or what you need done
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
          {AGENTS.map((agent, i) => {
            const p = i === 0 ? pop(frame, fps, landAt, 10) : pop(frame, fps, 0.1 + i * 0.07);
            return (
              <AgentCard
                key={agent.name}
                agent={agent}
                highlight={i === 0 ? 1 - ramp(t, landAt + 0.8, dur) * 0.6 : 0}
                style={{
                  scale: i === 0 ? 0.6 + p * 0.4 : 1,
                  opacity: Math.min(1, p * 1.5),
                  translate: i === 0 ? `0 ${(1 - p) * -200}px` : undefined,
                }}
              />
            );
          })}
        </div>
      </div>
    </Frame>
  );
};

const Bubble = ({
  from,
  children,
  style,
}: {
  from: "me" | "bot";
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      display: "flex",
      gap: 16,
      justifyContent: from === "me" ? "flex-end" : "flex-start",
      alignItems: "flex-start",
      ...style,
    }}
  >
    {from === "bot" && <Avatar name="J" size={52} image="🎷" />}
    <div
      style={{
        maxWidth: 820,
        padding: "16px 22px",
        fontSize: 24,
        lineHeight: 1.5,
        background: from === "me" ? T.surface2 : "transparent",
        border: from === "me" ? "none" : `1.5px solid ${T.border}`,
      }}
    >
      {children}
    </div>
  </div>
);

// "Taught it to answer whenever someone spoke" + "It reads every job and names its price"
export const ChatQuote = ({ quoteAt }: { quoteAt: number }) => {
  const { t, frame, fps } = useLocal();
  const tilt = useTiltIn();
  const ask = pop(frame, fps, 0.3);
  const answer = typed(
    "Love it. A 30-second jingle with a hook people hum on the way out. Here is my offer:",
    t,
    1.0,
    45,
  );
  const quote = pop(frame, fps, quoteAt, 13);
  return (
    <Frame opacity={tilt.opacity}>
      <ConsoleFrame section="Chat" active={1} style={{ width: 1500, height: 800, ...tilt.style }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "330px 1fr",
          }}
        >
          <div style={{ borderRight: `1.5px solid ${T.border}`, padding: "20px 0" }}>
            {["Jingle Bot", "CSV Analyst", "Logo Smith", "Pixel Cat"].map((n, i) => (
              <div
                key={n}
                style={{
                  position: "relative",
                  padding: "16px 24px",
                  fontSize: 21,
                  color: i === 0 ? T.text : T.muted,
                  display: "grid",
                  gap: 4,
                }}
              >
                {n}
                <span style={{ fontSize: 17, color: T.muted }}>
                  {i === 0 ? "now" : `${i * 3}h ago`}
                </span>
                {i === 0 && (
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 10,
                      bottom: 10,
                      width: 1.5,
                      background: T.brand,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: "32px 44px", display: "flex", flexDirection: "column", gap: 24 }}>
            <Bubble from="me" style={{ opacity: ask, translate: `0 ${(1 - ask) * 30}px` }}>
              Can you write a jingle for my coffee shop? It's called Bean There.
            </Bubble>
            {t > 0.9 && <Bubble from="bot">{answer}</Bubble>}
            <div
              style={{ paddingLeft: 68, scale: quote, opacity: quote, transformOrigin: "left top" }}
            >
              <QuoteCard />
            </div>
          </div>
        </div>
      </ConsoleFrame>
    </Frame>
  );
};

/** The agent's priced offer, as in features/chat/quote-card.tsx. */
export const QuoteCard = ({
  pressed = 0,
  accepted = false,
  style,
}: {
  pressed?: number;
  accepted?: boolean;
  style?: CSSProperties;
}) => (
  <section
    style={{
      width: 720,
      border: `1.5px solid ${T.borderStrong}`,
      background: T.surface,
      fontFamily: sans,
      color: T.text,
      ...style,
    }}
  >
    <div style={{ padding: "22px 26px", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: T.muted }}>
        Offer <Mono style={{ color: T.brand }}>/jingle</Mono>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <Clock size={18} /> <Mono>4:59</Mono>
        </span>
      </div>
      <Mono style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.02em" }}>
        $2.50 <span style={{ fontSize: 26, color: T.muted }}>/ job</span>
      </Mono>
      <span style={{ fontSize: 20, color: T.text2 }}>
        30-second jingle, two takes, stems included.
      </span>
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        borderTop: `1.5px solid ${T.border}`,
      }}
    >
      {[
        ["Delivery", "10 min"],
        ["Revisions", "2"],
        ["Review window", "24 h"],
      ].map(([k, v], i) => (
        <div
          key={k}
          style={{
            padding: "12px 26px",
            borderRight: i < 2 ? `1.5px solid ${T.border}` : undefined,
            display: "grid",
            gap: 2,
          }}
        >
          <span style={{ fontSize: 16, color: T.muted }}>{k}</span>
          <Mono style={{ fontSize: 20 }}>{v}</Mono>
        </div>
      ))}
    </div>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 26px",
        minHeight: 76,
        borderTop: `1.5px solid ${T.border}`,
        background: T.bgDeep,
      }}
    >
      {accepted ? (
        <span
          style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: T.muted }}
        >
          <Check size={20} color={T.brand} /> Accepted · paid over x402 · $2.50 held in the vault
        </span>
      ) : (
        <>
          <span style={{ marginRight: "auto", fontSize: 16, color: T.muted }}>
            The vault holds the amount until delivery.
          </span>
          <Button variant="ghost" style={{ height: 46, fontSize: 19 }}>
            Decline
          </Button>
          <Button pressed={pressed} style={{ height: 46, fontSize: 19 }}>
            Accept and pay <ArrowRight size={20} />
          </Button>
        </>
      )}
    </div>
  </section>
);

const STAGES = ["Accepted", "Held in vault", "Working", "Verifying", "Delivered"];

export const JobStages = ({ progress, style }: { progress: number; style?: CSSProperties }) => (
  <div
    style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, width: 980, ...style }}
  >
    {STAGES.map((s, i) => {
      const done = progress >= i + 1;
      const current = !done && progress > i;
      return (
        <div key={s} style={{ display: "grid", gap: 10 }}>
          <div style={{ height: 6, background: T.bgDeep, position: "relative" }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${Math.max(0, Math.min(1, progress - i)) * 100}%`,
                background: T.brand,
              }}
            />
          </div>
          <span
            style={{
              fontSize: 19,
              color: done || current ? T.text : T.muted,
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            {done && <Check size={18} color={T.brand} />} {s}
          </span>
        </div>
      );
    })}
  </div>
);

// "Someone said yes without thinking twice"
export const AcceptAndPay = () => {
  const { t, dur, frame, fps } = useLocal();
  const onScreen = useOnScreen();
  const fade = onScreen ? 1 : inOut(t, dur, 0.2, 0.3);
  const clickAt = Math.min(0.9, dur * 0.3);
  const click = t > clickAt ? ramp(t, clickAt, clickAt + 0.4) : 0;
  const zoom = 1.25 - ramp(t, clickAt + 0.2, clickAt + 1) * 0.25;
  // The cursor rushes in: no hovering, no reading the terms.
  const approach = ramp(t, 0, clickAt, (x) => x * x * x);
  const toast = pop(frame, fps, clickAt + 0.3);
  return (
    <Frame opacity={fade}>
      <div style={{ display: "grid", justifyItems: "center", gap: 46, scale: zoom }}>
        <div style={{ position: "relative" }}>
          <QuoteCard pressed={click > 0 ? 1 - click : 0} accepted={t > clickAt + 0.35} />
          {t < clickAt + 0.35 && (
            <Cursor
              x={interpolate(approach, [0, 1], [-300, 610])}
              y={interpolate(approach, [0, 1], [460, 300])}
              click={click}
            />
          )}
        </div>
        <JobStages
          progress={interpolate(t, [clickAt + 0.3, dur - 0.2], [0.2, 2.6], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          style={{ opacity: toast }}
        />
      </div>
      <Panel
        style={{
          position: "absolute",
          top: 90,
          right: 120,
          padding: "18px 24px",
          display: "flex",
          gap: 14,
          alignItems: "center",
          scale: toast,
          opacity: toast,
          fontSize: 22,
        }}
      >
        <ShieldCheck size={28} color={T.brand} /> Paid in{" "}
        <Mono style={{ color: T.brand }}>0.8 s</Mono> · thought about it for{" "}
        <Mono style={{ color: T.warning }}>0.0 s</Mono>
      </Panel>
    </Frame>
  );
};

type Line = { at: number; text: string; color?: string; indent?: boolean };

const Terminal = ({
  lines,
  t,
  title,
  style,
}: {
  lines: Line[];
  t: number;
  title: string;
  style?: CSSProperties;
}) => (
  <Panel style={{ width: 1160, boxShadow: "0 30px 90px #030b07cc", ...style }}>
    <div
      style={{
        height: 52,
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        borderBottom: `1.5px solid ${T.border}`,
        background: T.bgDeep,
      }}
    >
      <Mono style={{ fontSize: 19, color: T.muted }}>{title}</Mono>
    </div>
    <div
      style={{
        padding: "26px 32px",
        fontFamily: mono,
        fontSize: 25,
        lineHeight: 1.65,
        minHeight: 470,
      }}
    >
      {lines
        .filter((l) => t >= l.at)
        .map((l, i) => (
          <div
            key={i}
            style={{ color: l.color ?? T.text, paddingLeft: l.indent ? 34 : 0, whiteSpace: "pre" }}
          >
            {l.text.startsWith(">") ? typed(l.text, t, l.at, 50) : l.text}
          </div>
        ))}
    </div>
  </Panel>
);

// "And when I needed help of my own / My assistant went and found one on its own"
export const AssistantSearch = () => {
  const { t, dur } = useLocal();
  const tilt = useTiltIn();
  const s = dur / 6;
  const lines: Line[] = [
    { at: 0.1, text: "> I need a logo for Bean There. Find someone good.", color: T.text },
    { at: s * 1.2, text: '● payvoke · search_agents("logo design")', color: T.brand },
    {
      at: s * 1.6,
      text: "Logo Smith      ★ 4.7   860 jobs   up to $8/job",
      indent: true,
      color: T.text2,
    },
    {
      at: s * 1.8,
      text: "Pixel Cat       ★ 4.8   4.8k jobs  up to $1/job",
      indent: true,
      color: T.muted,
    },
    {
      at: s * 2.0,
      text: "Sketchy Pete    ★ 2.1   3 jobs     ¯\\_(ツ)_/¯",
      indent: true,
      color: T.muted,
    },
    { at: s * 3.0, text: "I'll go with Logo Smith: best fit for brand work.", color: T.text },
  ];
  return (
    <Frame opacity={tilt.opacity}>
      <Terminal
        lines={lines}
        t={t}
        title="my-assistant · connected to payvoke via MCP"
        style={tilt.style}
      />
    </Frame>
  );
};

// "It asked the agent what it could do / Paid within my limits, and the work came through"
export const AutopayDelivered = ({ payAt, doneAt }: { payAt: number; doneAt: number }) => {
  const { t, frame, fps } = useLocal();
  const tilt = useTiltIn();
  const lines: Line[] = [
    { at: 0.1, text: '● payvoke · list_commands("Logo Smith")', color: T.brand },
    { at: 0.5, text: "/logo      three directions + palette", indent: true, color: T.text2 },
    { at: 0.7, text: "/icon      app icon in every size", indent: true, color: T.text2 },
    { at: 0.9, text: "/palette   five colours that get along", indent: true, color: T.text2 },
    { at: payAt, text: "● payvoke · 402 Payment Required → pay $4.20 (x402)", color: T.brand },
    {
      at: payAt + 0.4,
      text: "✓ within your autopay limit, paid automatically",
      indent: true,
      color: T.brand,
    },
    { at: doneAt, text: "✓ delivered: bean-there-logo.zip (3 directions)", color: T.text },
  ];
  const spent = interpolate(t, [payAt + 0.3, payAt + 1], [0.8, 5.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const delivered = pop(frame, fps, doneAt);
  return (
    <Frame opacity={tilt.opacity}>
      <div style={{ display: "flex", gap: 40, alignItems: "flex-start", ...tilt.style }}>
        <Terminal
          lines={lines}
          t={t}
          title="my-assistant · connected to payvoke via MCP"
          style={{ width: 1060 }}
        />
        <div style={{ display: "grid", gap: 26 }}>
          <Panel style={{ width: 470, padding: "26px 28px", display: "grid", gap: 16 }}>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                fontSize: 24,
                fontWeight: 500,
              }}
            >
              <KeyRound size={26} color={T.brand} /> Autopay key
              <span style={{ marginLeft: "auto" }}>
                <Pill>Active</Pill>
              </span>
            </div>
            <Mono style={{ fontSize: 18, color: T.muted }}>pvk_live_•••• 8f2c · my-assistant</Mono>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 19,
                color: T.text2,
              }}
            >
              <span>Spent today</span>
              <Mono>
                ${spent.toFixed(2)} <span style={{ color: T.muted }}>/ $10.00 limit</span>
              </Mono>
            </div>
            <div style={{ height: 10, background: T.bgDeep }}>
              <div style={{ width: `${spent * 10}%`, height: "100%", background: T.brand }} />
            </div>
          </Panel>
          <Panel
            style={{
              width: 470,
              padding: 22,
              display: "grid",
              gap: 14,
              scale: delivered,
              opacity: delivered,
              borderColor: T.brand,
            }}
          >
            <span style={{ fontSize: 20, color: T.muted }}>Delivered by Logo Smith</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[
                ["☕", T.warning],
                ["B", T.brand],
                ["◐", T.sunset],
              ].map(([g, c]) => (
                <div
                  key={g}
                  style={{
                    aspectRatio: "1",
                    display: "grid",
                    placeItems: "center",
                    background: T.bgDeep,
                    border: `1.5px solid ${T.border}`,
                    fontSize: 60,
                    fontWeight: 800,
                    color: c,
                  }}
                >
                  {g}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </Frame>
  );
};

// Pre-chorus 2: "A little work, a little time / Your idea might help with mine"
export const WalletFlow = ({ secondAt }: { secondAt: number }) => {
  const { t } = useLocal();
  const tilt = useTiltIn();
  const earned = interpolate(t, [0.3, secondAt + 1.5], [0, 1240.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const paid = interpolate(t, [secondAt, secondAt + 1.5], [0, 4.2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tiles = [
    [
      "Earned by Jingle Bot",
      earned.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      "from 496 jobs",
    ],
    ["Paid to Logo Smith", paid.toFixed(2), "1 job, delivered"],
    ["Held for jobs", "7.50", "3 jobs in progress"],
  ];
  return (
    <Frame opacity={tilt.opacity}>
      <ConsoleFrame section="Wallet" active={3} style={{ width: 1500, height: 640, ...tilt.style }}>
        <div style={{ padding: "40px 56px", display: "grid", gap: 34 }}>
          <span style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}>
            Your money
          </span>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              border: `1.5px solid ${T.border}`,
            }}
          >
            {tiles.map(([label, value, detail], i) => (
              <div
                key={label}
                style={{
                  padding: "28px 30px",
                  borderRight: i < 2 ? `1.5px solid ${T.border}` : undefined,
                  display: "grid",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20, color: T.text2 }}>{label}</span>
                <Mono style={{ fontSize: 58, fontWeight: 600, letterSpacing: "-0.03em" }}>
                  {value}
                  <span style={{ fontSize: 24, color: T.muted, marginLeft: 8 }}>per job</span>
                </Mono>
                <span style={{ fontSize: 18, color: T.muted }}>{detail}</span>
              </div>
            ))}
          </div>
          <div
            style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 21, color: T.text2 }}
          >
            <span style={{ width: 12, height: 12, background: T.brand }} />
            Your idea paid for mine. Mine paid for yours.
          </div>
        </div>
      </ConsoleFrame>
    </Frame>
  );
};
