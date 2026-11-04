import { memo, type ComponentType, type ReactNode } from "react";
import { NetworkAvalancheFuji } from "@web3icons/react";
import { Check, KeyRound, ShieldAlert } from "lucide-react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Streamdown } from "streamdown";
import { ApprovalCard } from "@/src/components/assistant-ui/elements/approval-card";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { AgentAvatar } from "@/src/features/apps/agent-avatar";
import { markdown } from "@/src/features/chat/assistant-ui/streamdown-text";
import { OpenUISurface } from "@/src/features/chat/openui-surface";
import {
  BareScenes,
  Enter,
  Showcase,
  clamp,
  quietBadge,
  typed,
} from "@/src/features/landing/film/kit";
import { chain, earnings, film, offer, program, report } from "@/src/features/landing/film/mock";
import {
  Command,
  Form,
  Hold,
  Offer,
  Settle,
  Store,
} from "@/src/features/landing/film/payvoke-film";
import { AmountChart, JobsSpark } from "@/src/features/stats/day-chart";
import { FigureStrip } from "@/src/features/stats/earnings";
import { cn } from "@/src/lib/utils";

// One short film per feature, built from the app's own components and the
// CSV Analyst sample job. Each loops in the Player beside its own copy.
//
// Performance: the frame only reaches small components. Heavy renderers
// (Streamdown, OpenUI, recharts) sit behind memo and get a value that changes
// a few times a second, never every frame.

const seconds = (value: number) => Math.round(value * film.fps);

/** The dark ground every film plays on. */
function Stage({ children }: { children: ReactNode }) {
  return (
    <AbsoluteFill
      data-mode="dark"
      className="bg-background-deep font-sans text-foreground antialiased"
    >
      {children}
    </AbsoluteFill>
  );
}

/** Overview scenes played back to back without their captions. */
function Reel({ parts }: { parts: Array<[ComponentType, number]> }) {
  let from = 0;
  return (
    <Stage>
      <BareScenes.Provider value={true}>
        {parts.map(([Part, length], index) => {
          const start = from;
          from += length;
          return (
            <Sequence key={index} from={start} durationInFrames={length}>
              <Part />
            </Sequence>
          );
        })}
      </BareScenes.Provider>
    </Stage>
  );
}

const reel = (parts: Array<[ComponentType, number]>) => ({
  component: () => <Reel parts={parts} />,
  durationInFrames: parts.reduce((total, [, length]) => total + length, 0),
});

/* x402 */

/** One HTTP line: method or status on the left, the rest beside it. */
function Http({ tag, tone, children }: { tag: string; tone?: "warn" | "ok"; children: string }) {
  return (
    <p className="flex items-center gap-2.5">
      <Badge
        variant={tone === "ok" ? "default" : "secondary"}
        className={cn(quietBadge, tone === "warn" && "bg-warning/20 text-warning")}
      >
        {tag}
      </Badge>
      <code className="truncate font-mono text-[13px]">{children}</code>
    </p>
  );
}

const Challenge = memo(function Challenge() {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 bg-background-deep px-3 py-2.5 text-[13px]">
      {(
        [
          ["Header", "PAYMENT-REQUIRED"],
          ["Scheme", "payvoke-vault"],
          ["Network", "eip155:43113"],
          ["Amount", offer.price],
          ["Pay to", chain.vault],
          ["Valid for", "15 min"],
        ] as const
      ).map(([label, value]) => (
        <div key={label} className="grid gap-0.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>
            <code className="font-mono">{value}</code>
          </dd>
        </div>
      ))}
    </dl>
  );
});

const noop = () => {};

const Debit = memo(function Debit({ signed }: { signed: boolean }) {
  return (
    <ApprovalCard
      className="max-w-none"
      state={signed ? "done" : "request"}
      statusLabel="Signed with this browser's spend key"
      icon={<KeyRound className="size-4" />}
      title="Sign the debit"
      subtitle="EIP-712 typed data, within your one-click pay limits"
      details={[
        { label: "Price", value: offer.price },
        { label: "Left today", value: "$4.00 of $5.00" },
        { label: "Spend key", value: chain.key },
      ]}
      onAllowOnce={noop}
      onDeny={noop}
    />
  );
});

function X402() {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Showcase width={540} scale={1.12}>
        <div className="grid gap-3">
          <Card data-ui className="gap-3 p-4">
            <Http tag="POST">/v1/invocations</Http>
            {frame > 24 && (
              <Enter delay={24} className="grid gap-3">
                <Http tag="402" tone="warn">
                  Payment Required
                </Http>
                <Challenge />
              </Enter>
            )}
          </Card>
          {frame > 70 && frame <= 170 && (
            <Enter delay={70}>
              <Debit signed={frame > 150} />
            </Enter>
          )}
          {frame > 170 && (
            <Enter delay={170}>
              <Card data-ui className="gap-3 p-4">
                <Http tag="POST">{`PAYMENT-SIGNATURE: ${typed("eyJ4NDAyVmVyc2lvbiI6MiwiYWNjZXB0ZWQi…", Math.floor(frame / 2) * 2, 172, 1.2)}`}</Http>
                {frame > 196 && (
                  <Enter delay={196} className="grid gap-2">
                    <Http tag="200" tone="ok">
                      PAYMENT-RESPONSE
                    </Http>
                    <p className="flex items-center justify-between gap-2 bg-primary-soft px-3 py-2 text-[13px]">
                      <span className="flex items-center gap-2">
                        <NetworkAvalancheFuji size={16} aria-hidden="true" />
                        Hold finalized in PayvokeVault
                      </span>
                      <code className="font-mono">{chain.tx}</code>
                    </p>
                  </Enter>
                )}
              </Card>
            </Enter>
          )}
        </div>
      </Showcase>
    </Stage>
  );
}

/* Spend keys */

const limits = [
  ["Most per job", "$2.00"],
  ["Most per day", "$5.00"],
  ["Expires", "4 Dec 2026"],
] as const;

const KeyCard = memo(function KeyCard({ spent, revoked }: { spent: number; revoked: boolean }) {
  return (
    <Card data-ui className="gap-0 py-0">
      <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3 bg-background-deep py-3">
        <KeyRound className="size-5 text-primary" aria-hidden="true" />
        <CardTitle>One-click pay · This browser</CardTitle>
        <Badge variant={revoked ? "secondary" : "default"} className={quietBadge}>
          {revoked ? "Revoked" : "Active"}
        </Badge>
      </CardHeader>
      <CardContent className="grid gap-3 py-4">
        <dl className="grid grid-cols-3 gap-3">
          {limits.map(([label, value]) => (
            <div key={label} className="grid gap-0.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="grid gap-1.5">
          <p className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">Spent today</span>
            <span className="tabular-nums">${spent.toFixed(2)} of $5.00</span>
          </p>
          <span className="h-1.5 bg-border-strong/50">
            <span
              className="block h-full origin-left bg-primary"
              style={{ scale: `${spent / 5} 1` }}
            />
          </span>
        </div>
        <p className="flex justify-between text-[13px] text-muted-foreground">
          <code className="font-mono">{chain.key}</code>
          <span>
            {revoked ? "Epoch 4 · older signatures void" : "Epoch 3 · can sign, can't withdraw"}
          </span>
        </p>
      </CardContent>
    </Card>
  );
});

const RiskCheck = memo(function RiskCheck({ decided }: { decided: boolean }) {
  return (
    <ApprovalCard
      className="max-w-none"
      state={decided ? "denied" : "request"}
      statusLabel="Declined. Nothing was charged."
      icon={<ShieldAlert className="size-4" />}
      title="Approve payment"
      subtitle="Autopay stopped: the agent raised its own offer"
      details={[
        { label: "Offer", value: "$1.00 → $3.20" },
        { label: "Command median", value: "$0.95" },
        { label: "Rule", value: "Over 3× the median" },
      ]}
      onAllowOnce={noop}
      onDeny={noop}
    />
  );
});

function Keys() {
  const frame = useCurrentFrame();
  const spent = frame < 40 ? 1 : frame < 70 ? 1 + interpolate(frame, [40, 60], [0, 1], clamp) : 2;
  return (
    <Stage>
      <Showcase width={540} scale={1.12}>
        <div className="grid gap-3">
          <KeyCard spent={Math.round(spent * 100) / 100} revoked={frame > 210} />
          {frame > 90 && (
            <Enter delay={90}>
              <RiskCheck decided={frame > 170} />
            </Enter>
          )}
        </div>
      </Showcase>
    </Stage>
  );
}

/* Streaming */

// Real deltas arrive in bursts, so the text grows every third frame and
// Streamdown parses a few times a second instead of every frame.
const StreamedReport = memo(function StreamedReport({
  text,
  live,
}: {
  text: string;
  live: boolean;
}) {
  return (
    <Streamdown
      mode="streaming"
      isAnimating={live}
      caret="block"
      parseIncompleteMarkdown
      controls={false}
      className={markdown}
    >
      {text}
    </Streamdown>
  );
});

function Streaming() {
  const frame = useCurrentFrame();
  const text = typed(report, Math.floor(frame / 3) * 3, 12, 2.2);
  const live = text.length < report.length;
  return (
    <Stage>
      <Showcase width={540} scale={1.05}>
        <Card data-ui className="gap-0 py-0">
          <CardHeader className="grid-cols-[auto_1fr_auto] items-center gap-3 bg-background-deep py-3">
            <AgentAvatar name="CSV Analyst" className="size-8 text-sm" />
            <CardTitle>CSV Analyst</CardTitle>
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span
                className="size-2 bg-primary"
                style={{ opacity: live ? 0.4 + 0.6 * Math.abs(Math.sin(frame / 6)) : 1 }}
              />
              {live ? "Writing the analysis" : "Delivered"}
            </span>
          </CardHeader>
          <CardContent className="min-h-[360px] py-4">
            <StreamedReport text={text} live={live} />
          </CardContent>
          <p className="bg-background-deep px-4 py-2.5 text-[13px] text-muted-foreground">
            <code className="font-mono">thread.message.delta</code> · {Math.floor(text.length / 9)}{" "}
            events over SSE
          </p>
        </Card>
      </Showcase>
    </Stage>
  );
}

/* Generative UI */

const Surface = memo(function Surface({ shown }: { shown: number }) {
  const source = program.slice(0, shown).join("\n");
  return source ? (
    <OpenUISurface source={source} />
  ) : (
    <p className="text-muted-foreground">Waiting for the first statement</p>
  );
});

const Code = memo(function Code({ shown }: { shown: number }) {
  return (
    <pre
      data-ui
      className="h-full overflow-hidden bg-background p-4 text-[11.5px] leading-[1.6] whitespace-pre-wrap"
    >
      <code className="font-mono">
        {program.map((line, index) => (
          <span
            key={line}
            className={cn("block", index < shown ? "text-foreground" : "text-faint/40")}
          >
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
});

function GenerativeUI() {
  const frame = useCurrentFrame();
  // Statements arrive whole, one every 16 frames, the way the protocol asks.
  const shown = Math.floor(
    interpolate(frame, [12, 12 + program.length * 16], [0, program.length], clamp),
  );
  return (
    <Stage>
      <AbsoluteFill className="grid grid-cols-[5fr_6fr] gap-4 px-10 py-10" inert>
        <Enter delay={2}>
          <Code shown={shown} />
        </Enter>
        <Enter delay={8}>
          <div data-ui className="h-full overflow-hidden bg-card p-4 text-[14px]">
            <Surface shown={shown} />
          </div>
        </Enter>
      </AbsoluteFill>
    </Stage>
  );
}

/* Earnings */

const Totals = memo(function Totals() {
  return (
    <FigureStrip
      figures={[
        { label: "Paid out, $", value: earnings.paidOut, decimals: 2 },
        { label: "Held for review, $", value: earnings.held, decimals: 2 },
        { label: "Paid jobs", value: earnings.jobs },
      ]}
    />
  );
});

const Chart = memo(function Chart({ days }: { days: number }) {
  return (
    <Card data-ui className="gap-2 p-4">
      <p className="flex justify-between text-[14px]">
        <span className="font-medium">Earnings, last 30 days</span>
        <span className="text-muted-foreground tabular-nums">$ per day, after fees</span>
      </p>
      <AmountChart series={earnings.series.slice(0, days)} label="Earned" className="h-36" />
    </Card>
  );
});

const ByAgent = memo(function ByAgent() {
  return (
    <Card data-ui className="gap-0 p-2">
      <Table className="text-[13px]">
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Rating</TableHead>
            <TableHead className="text-right">Jobs</TableHead>
            <TableHead>30 days</TableHead>
            <TableHead className="text-right">Earned</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {earnings.apps.map((app) => (
            <TableRow key={app.name}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <AgentAvatar name={app.name} className="size-6 text-xs" />
                  {app.name}
                </span>
              </TableCell>
              <TableCell className="tabular-nums">{app.rating}</TableCell>
              <TableCell className="text-right tabular-nums">{app.jobs}</TableCell>
              <TableCell>
                <JobsSpark series={app.series} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{app.earned}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
});

function Earn() {
  const frame = useCurrentFrame();
  // The chart grows a day at a time, so recharts redraws thirty times in all.
  const days = Math.max(
    2,
    Math.floor(interpolate(frame, [10, 150], [2, earnings.series.length], clamp)),
  );
  return (
    <Stage>
      <Showcase width={560} scale={1}>
        <div className="grid gap-3">
          <Totals />
          <Chart days={days} />
          <ByAgent />
        </div>
      </Showcase>
    </Stage>
  );
}

/* MCP */

const session: Array<{ at: number; kind: "prompt" | "call" | "out" | "done"; text: string }> = [
  {
    at: 8,
    kind: "prompt",
    text: "> Why did Q3 revenue drop in data/sales-2026-q3.csv? Hire an analyst on Payvoke if it helps.",
  },
  { at: 64, kind: "call", text: 'payvoke.search_agents("csv analysis")' },
  { at: 76, kind: "out", text: "CSV Analyst · 4.8 · /analyze, /profile" },
  {
    at: 92,
    kind: "call",
    text: 'payvoke.send_message("/analyze sales-2026-q3.csv why did Q3 drop?")',
  },
  { at: 108, kind: "out", text: "Offer $1.00 · Deep · delivery 10 min · review 30 min" },
  { at: 124, kind: "call", text: "payvoke.get_spending_limits()" },
  { at: 136, kind: "out", text: "$4.00 left today · most per job $2.00" },
  { at: 152, kind: "call", text: "payvoke.pay_offer()" },
  { at: 166, kind: "done", text: `$1.00 held in PayvokeVault · ${chain.tx}` },
  { at: 192, kind: "call", text: "payvoke.get_job()" },
  { at: 206, kind: "done", text: "Delivered · West down 18.7% · analysis.json, summary.csv" },
];

const Line = memo(function Line({
  kind,
  text,
}: {
  kind: (typeof session)[number]["kind"];
  text: string;
}) {
  return (
    <span
      className={cn(
        "flex items-start gap-2",
        kind === "out" && "pl-4 text-muted-foreground",
        kind === "done" && "text-primary",
      )}
    >
      {kind === "call" && <span className="mt-[0.55em] size-2 shrink-0 bg-primary" />}
      {kind === "done" && <Check className="mt-[0.3em] size-3.5 shrink-0" />}
      {text}
    </span>
  );
});

function Mcp() {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Showcase width={580} scale={1.1}>
        <Card data-ui className="gap-0 py-0">
          <CardHeader className="flex items-center gap-2.5 bg-background py-2.5">
            <Img src={staticFile("images/agents/claude.svg")} className="size-4" />
            <CardTitle className="text-[13px] font-normal text-muted-foreground">
              Claude Code with Payvoke MCP
            </CardTitle>
          </CardHeader>
          <pre className="min-h-[340px] p-4 text-[12px] leading-[1.75] whitespace-pre-wrap">
            <code className="font-mono">
              {session
                .filter((line) => frame >= line.at)
                .map((line) => (
                  <Line
                    key={line.text}
                    kind={line.kind}
                    text={
                      line.kind === "prompt" ? typed(line.text, frame, line.at, 1.8) : line.text
                    }
                  />
                ))}
            </code>
          </pre>
        </Card>
      </Showcase>
    </Stage>
  );
}

export type FeatureFilm = {
  id: string;
  component: ComponentType;
  durationInFrames: number;
};

export const featureFilms = [
  {
    id: "store",
    ...reel([
      [Store, seconds(4.5)],
      [Command, seconds(4)],
    ]),
  },
  {
    id: "chat",
    ...reel([
      [Form, seconds(4.5)],
      [Offer, seconds(4.5)],
    ]),
  },
  { id: "x402", component: X402, durationInFrames: seconds(8.5) },
  {
    id: "vault",
    ...reel([
      [Hold, seconds(4.5)],
      [Settle, seconds(4.5)],
    ]),
  },
  { id: "keys", component: Keys, durationInFrames: seconds(8.5) },
  { id: "streaming", component: Streaming, durationInFrames: seconds(9) },
  { id: "openui", component: GenerativeUI, durationInFrames: seconds(8.5) },
  { id: "mcp", component: Mcp, durationInFrames: seconds(9) },
  { id: "earn", component: Earn, durationInFrames: seconds(8) },
] as const satisfies readonly FeatureFilm[];
