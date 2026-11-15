import type { ReactNode } from "react";
import { BarChart3, Check, Code2, FileText, Lock, RotateCcw, ShieldCheck } from "lucide-react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { VIET, clamp, out, rise } from "@/src/remotion/launch/stage";
import { beatOf, cue, cueEnd, cueOut } from "@/src/remotion/launch/timeline";

// The opening, in three spoken beats on the light field: what agents can
// do now, the catch (pay first, lose it if the job fails), then Payvoke: the mark builds
// itself from its nine squares, the name is drawn in and the promise
// follows. Type and squares move; nothing zooms or blurs.

/** Words that rise into place one after another. */
function Words({ text, from, every = 3, className, style }: { text: string; from: number; every?: number; className?: string; style?: React.CSSProperties }) {
  const frame = useCurrentFrame();
  return (
    <span className={className} style={{ fontFamily: VIET, ...style }}>
      {text.split(" ").map((word, i) => {
        const k = rise(frame, from + i * every, 16);
        return (
          <span key={i} className="inline-block whitespace-pre" style={{ opacity: k, translate: `0 ${(1 - k) * 34}px` }}>
            {word}{" "}
          </span>
        );
      })}
    </span>
  );
}

/** 1 while `from..to` is on screen, with short fades at both ends. */
const span = (frame: number, from: number, to: number) =>
  rise(frame, from, 12) * (1 - interpolate(frame, [to - 10, to], [0, 1], clamp));

/* Beat 1: agents do real work */

const tasks = [
  { icon: BarChart3, title: "Phân tích dữ liệu" },
  { icon: Code2, title: "Viết code" },
  { icon: FileText, title: "Sửa CV" },
];

function Work({ frame }: { frame: number }) {
  const h1 = cue("hook1");
  const end = cue("hook2") - 2;
  const shown = span(frame, 0, end);
  if (shown <= 0) return null;
  const every = (cueEnd("hook1") - h1) / 4;
  return (
    <AbsoluteFill className="items-center justify-center" style={{ opacity: shown, translate: `0 ${-(1 - shown) * 20}px` }}>
      <p className="text-[92px] leading-none font-bold tracking-[-0.035em] text-foreground">
        <Words text={beatOf("hook1").text} from={h1} every={4} />
      </p>
      <div className="mt-20 flex gap-8">
        {tasks.map((task, i) => {
          const k = rise(frame, h1 + every * (i + 1) - 10, 20);
          const done = rise(frame, h1 + every * (i + 1) + 8, 10);
          return (
            <div
              key={task.title}
              className="grid w-[380px] gap-6 border border-border-strong bg-card p-7 shadow-[0_24px_60px_-30px_rgb(20_45_35/0.35)]"
              style={{ opacity: k, translate: `0 ${(1 - k) * 60}px` }}
            >
              <span className="flex items-center justify-between">
                <span className="grid size-16 place-items-center bg-primary-soft text-primary">
                  <task.icon size={32} />
                </span>
                <span className="grid size-10 place-items-center bg-primary text-primary-foreground" style={{ opacity: done, scale: 0.6 + 0.4 * done }}>
                  <Check size={22} strokeWidth={3} />
                </span>
              </span>
              <span className="text-[34px] font-semibold text-foreground" style={{ fontFamily: VIET }}>
                {task.title}
              </span>
              <span className="h-1.5 bg-border">
                <span className="block h-full bg-primary" style={{ width: `${interpolate(frame, [h1 + every * (i + 1) - 6, h1 + every * (i + 1) + 8], [0, 100], { ...clamp, easing: out })}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/* Beat 2: the catch */

function Catch({ frame }: { frame: number }) {
  const h2 = cue("hook2");
  const end = cue("title") - 4;
  const shown = span(frame, h2 - 4, end);
  if (shown <= 0) return null;
  const strike = interpolate(frame, [cueEnd("hook2") - 4, cueEnd("hook2") + 10], [0, 1], { ...clamp, easing: out });
  const bill = rise(frame, h2 + 34, 16);
  return (
    <AbsoluteFill className="items-center justify-center" style={{ opacity: shown }}>
      <p className="text-[56px] font-semibold text-muted-foreground">
        <Words text="Thuê agent hôm nay:" from={h2 - 4} />
      </p>
      <div className="relative mt-10 grid justify-items-center gap-6 text-[116px] leading-none font-extrabold tracking-[-0.045em] whitespace-nowrap">
        <Words text="Trả tiền trước." from={h2 + 10} every={5} className="text-foreground" />
        <span className="relative">
          <Words text="Hỏng việc thì mất." from={h2 + 22} every={5} style={{ color: "var(--t-warning)" }} />
          <span className="absolute top-[55%] left-0 h-[10px] bg-foreground" style={{ width: `calc(${strike} * (100% - 0.28em))` }} />
        </span>
      </div>
      <div
        className="mt-16 flex items-center gap-6 border border-border-strong bg-card px-8 py-5 font-mono text-[26px]"
        style={{ opacity: bill, translate: `0 ${(1 - bill) * 30}px` }}
      >
        <span className="text-destructive">−50 USDC</span>
        <span className="text-muted-foreground">→ agent</span>
        <span className="text-warning" style={{ fontFamily: VIET }}>
          không có kết quả, không đòi lại được
        </span>
      </div>
    </AbsoluteFill>
  );
}

/* Beat 3: Payvoke */

// The mark's nine squares: [column, row, shade]. 1 is jade, 0.18 a tint, 2 the pale centre.
const squares = [
  [0, 0, 1], [2, 0, 1], [0, 2, 1], [2, 2, 1],
  [1, 0, 0.18], [0, 1, 0.18], [2, 1, 0.18], [1, 2, 0.18],
  [1, 1, 2],
] as const;
// Where each square flies in from, in cells.
const from = [
  [-9, -5], [8, -6], [-8, 6], [9, 5], [1, -8], [-11, 0], [11, 1], [-1, 8], [0, 0],
];

function Mark({ frame, at }: { frame: number; at: number }) {
  const cell = 46;
  const gap = 12;
  const settle = rise(frame, at + 26, 18);
  return (
    <div className="relative" style={{ width: cell * 3 + gap * 2, height: cell * 3 + gap * 2, rotate: `${-8 * settle}deg` }}>
      {squares.map(([c, r, shade], i) => {
        const k = rise(frame, at + i * 2, 24);
        const [fx, fy] = from[i];
        const color = shade === 2 ? "#bcd6cb" : "#509475";
        return (
          <span
            key={i}
            className="absolute"
            style={{
              left: c * (cell + gap),
              top: r * (cell + gap),
              width: cell,
              height: cell,
              background: color,
              opacity: (shade === 0.18 ? 0.22 : 1) * k,
              translate: `${(1 - k) * fx * (cell + gap)}px ${(1 - k) * fy * (cell + gap)}px`,
            }}
          />
        );
      })}
    </div>
  );
}

const promises: { icon: ReactNode; text: string }[] = [
  { icon: <Lock size={26} />, text: "Tiền nằm trong ký quỹ on-chain" },
  { icon: <Check size={26} />, text: "Agent nhận tiền khi xong việc" },
  { icon: <RotateCcw size={26} />, text: "Không giao kịp hạn, tự hoàn tiền" },
];

function Reveal({ frame }: { frame: number }) {
  const t = cue("title");
  const start = t - 8;
  if (frame < start) return null;
  const name = interpolate(frame, [start + 30, start + 52], [0, 100], { ...clamp, easing: out });
  const every = (cueEnd("title") - t) / 4;
  const leave = interpolate(frame, [cueOut("title") - 14, cueOut("title")], [0, 1], clamp);
  return (
    <AbsoluteFill className="items-center justify-center" style={{ opacity: 1 - leave }}>
      <div className="flex items-center gap-10">
        <Mark frame={frame} at={start} />
        <span
          className="text-[150px] leading-none font-bold tracking-[-0.065em] text-foreground"
          style={{ clipPath: `inset(-10% ${100 - name}% -20% 0)` }}
        >
          payvoke<span className="text-primary">.</span>
        </span>
      </div>
      <p className="mt-12 text-[46px] font-semibold text-foreground">
        <Words text={beatOf("title").text} from={start + 48} every={2} />
      </p>
      <div className="mt-14 flex gap-5">
        {promises.map((item, i) => {
          const k = rise(frame, t + every * (i + 1.4), 16);
          return (
            <span
              key={item.text}
              className="flex items-center gap-3 border border-primary/40 bg-primary-soft px-6 py-4 text-[28px] font-medium text-foreground"
              style={{ fontFamily: VIET, opacity: k, translate: `0 ${(1 - k) * 24}px` }}
            >
              <span className="text-primary">{item.icon}</span>
              {item.text}
            </span>
          );
        })}
      </div>
      <p
        className="mt-12 flex items-center gap-3 font-mono text-[22px] tracking-[0.1em] text-muted-foreground"
        style={{ opacity: rise(frame, t + every * 4.4, 16) }}
      >
        <ShieldCheck size={22} className="text-primary" /> Avalanche · USDC · MCP
      </p>
    </AbsoluteFill>
  );
}

export function IntroScene() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Work frame={frame} />
      <Catch frame={frame} />
      <Reveal frame={frame} />
    </AbsoluteFill>
  );
}
