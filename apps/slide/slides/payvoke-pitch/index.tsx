import {
  type DesignSystem,
  type Page,
  type SlideMeta,
  type SlideTransition,
  useSlidePageNumber,
} from "@open-slide/core";
import type { CSSProperties, ReactNode } from "react";
import logo from "./assets/logo.svg";

// Osaka Jade daylight. Nền phẳng, kẻ mảnh, một ý mỗi dòng.
export const design: DesignSystem = {
  palette: { bg: "#f6f8f7", text: "#14261e", accent: "#286346" },
  fonts: {
    display: '"Inter Tight", system-ui, sans-serif',
    body: '"Inter Tight", system-ui, sans-serif',
  },
  typeScale: { hero: 176, body: 32 },
  radius: 0,
};

const bodyInk = "#3d5348";
const muted = "#5b7065";
const line = "#d5dfd9";
const lineStrong = "#9cb0a4";
const soft = "#e1ece5";
const surface = "#ffffff";
const red = "#a52b35";
const ink = "#f8fbf9";

const display = "var(--osd-font-display)";
const sans = "var(--osd-font-body)";
const mono = '"JetBrains Mono", ui-monospace, monospace';
const accent = "var(--osd-accent)";
const text = "var(--osd-text)";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
const FONT_LINK_ID = "osd-webfont-payvoke-pitch";
if (typeof document !== "undefined") {
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== FONT_HREF) link.href = FONT_HREF;
}

// Con trỏ nhấp nháy cho chữ đang stream.
const KEYFRAMES_ID = "osd-keyframes-payvoke-pitch";
if (typeof document !== "undefined" && !document.getElementById(KEYFRAMES_ID)) {
  const style = document.createElement("style");
  style.id = KEYFRAMES_ID;
  style.textContent =
    "@keyframes pv-blink{0%,49%{opacity:1}50%,100%{opacity:0}}@media (prefers-reduced-motion: reduce){.pv-caret{animation:none!important}}";
  document.head.appendChild(style);
}

const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

export const transition: SlideTransition = {
  duration: 260,
  exit: { duration: 260, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 260,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
  },
};

const settle: SlideTransition = {
  duration: 280,
  exit: { duration: 280, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 280,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: "translateY(12px)", filter: "blur(4px)" },
      { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
    ],
  },
};

// ---------- Khung trang ----------

const Footer = () => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 52,
        display: "flex",
        justifyContent: "space-between",
        paddingTop: 18,
        borderTop: `1px solid ${line}`,
        fontFamily: mono,
        fontSize: 18,
        letterSpacing: "0.14em",
        color: muted,
      }}
    >
      <span>PAYVOKE · TEAM FIREFLY</span>
      <span>
        {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
};

// Khung: tiêu đề ở trên, phần thân chiếm phần còn lại và căn giữa theo chiều dọc.
const Frame = ({
  n,
  label,
  title,
  children,
  bare,
}: {
  n?: string;
  label?: string;
  title?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      padding: "96px 120px 150px",
      display: "flex",
      flexDirection: "column",
      background: "var(--osd-bg)",
      color: text,
      fontFamily: sans,
    }}
  >
    {!bare && (
      <div style={{ flex: "none" }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ color: accent }}>{n}</span>
          <span style={{ color: muted, marginLeft: 20 }}>{label}</span>
        </div>
        <h2
          style={{
            fontFamily: display,
            fontSize: 66,
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: "-0.012em",
            margin: "18px 0 0",
          }}
        >
          {title}
        </h2>
      </div>
    )}
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingTop: bare ? 0 : 24,
      }}
    >
      {children}
    </div>
    <Footer />
  </div>
);

const Em = ({ children }: { children: ReactNode }) => (
  <span style={{ color: accent }}>{children}</span>
);

const Note = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontSize: 26, lineHeight: 1.5, color: muted, ...style }}>{children}</div>
);

const Label = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: "0.14em",
      color: muted,
      textTransform: "uppercase",
      marginBottom: 10,
      ...style,
    }}
  >
    {children}
  </div>
);

// Dòng thông số: nhãn trái, nội dung phải.
const Spec = ({
  k,
  children,
  w = 300,
  size = 32,
}: {
  k: string;
  children: ReactNode;
  w?: number;
  size?: number;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `${w}px 1fr`,
      gap: 32,
      padding: "22px 0",
      borderTop: `1px solid ${line}`,
      alignItems: "baseline",
    }}
  >
    <span style={{ fontSize: size, fontWeight: 600 }}>{k}</span>
    <span style={{ fontSize: size, lineHeight: 1.35, color: bodyInk }}>{children}</span>
  </div>
);

// Dòng có đánh số.
const Row = ({
  n,
  children,
  size = 32,
  tone = "brand",
}: {
  n: string;
  children: ReactNode;
  size?: number;
  tone?: "brand" | "warn" | "todo";
}) => (
  <div
    style={{
      display: "flex",
      gap: 24,
      alignItems: "baseline",
      padding: "22px 0",
      borderTop: `1px solid ${line}`,
    }}
  >
    <span
      style={{
        flex: "none",
        width: 44,
        fontFamily: mono,
        fontSize: 22,
        fontWeight: 700,
        color: tone === "warn" ? red : tone === "todo" ? muted : accent,
      }}
    >
      {n}
    </span>
    <span style={{ fontSize: size, lineHeight: 1.35 }}>{children}</span>
  </div>
);

const Block = ({ title, children, tag }: { title: string; children: ReactNode; tag?: string }) => (
  <div style={{ borderTop: `3px solid ${accent}`, paddingTop: 26 }}>
    {tag && <Label style={{ color: accent }}>{tag}</Label>}
    <div style={{ fontFamily: display, fontSize: 40, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 30, lineHeight: 1.45, color: bodyInk, marginTop: 12 }}>{children}</div>
  </div>
);

const Statement = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      padding: "26px 36px",
      background: soft,
      borderLeft: `6px solid ${accent}`,
      fontSize: 32,
      fontWeight: 600,
      lineHeight: 1.35,
      ...style,
    }}
  >
    {children}
  </div>
);

const Tag = ({ children, filled }: { children: ReactNode; filled?: boolean }) => (
  <span
    style={{
      display: "inline-block",
      padding: "6px 14px",
      background: filled ? soft : surface,
      border: `1px solid ${filled ? soft : line}`,
      color: accent,
      fontFamily: mono,
      fontSize: 20,
      fontWeight: 500,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

// ---------- Mockup ----------

const Window = ({ title, children }: { title: string; children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      background: surface,
      border: `1px solid ${lineStrong}`,
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 24px",
        borderBottom: `1px solid ${line}`,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 14, height: 14, background: accent }} />
      {title}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>{children}</div>
  </div>
);

const Caret = () => (
  <span
    className="pv-caret"
    style={{
      display: "inline-block",
      width: 12,
      height: 26,
      marginLeft: 6,
      verticalAlign: "-4px",
      background: accent,
      animation: "pv-blink 1s steps(1) infinite",
    }}
  />
);

const Msg = ({ from, children }: { from: "user" | "agent"; children: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: from === "user" ? "flex-end" : "flex-start" }}>
    <div
      style={{
        maxWidth: 640,
        padding: "14px 20px",
        fontSize: 26,
        lineHeight: 1.45,
        background: from === "user" ? soft : surface,
        border: `1px solid ${from === "user" ? soft : line}`,
      }}
    >
      {children}
    </div>
  </div>
);

const Option = ({ children, picked }: { children: ReactNode; picked?: boolean }) => (
  <span
    style={{
      flex: 1,
      padding: "12px 16px",
      fontSize: 24,
      border: `${picked ? 2 : 1}px solid ${picked ? accent : line}`,
      background: picked ? soft : surface,
    }}
  >
    {children}
  </span>
);

const OfferCard = () => (
  <div style={{ border: `2px solid ${accent}`, background: surface, padding: "18px 22px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
      <span>
        <b>Offer</b> · Deep
      </span>
      <b style={{ color: accent }}>$1.00</b>
    </div>
    <div style={{ fontSize: 21, color: muted, marginTop: 6 }}>
      Giao trong 10 phút · duyệt 30 phút · lỗi được hoàn tiền
    </div>
    <div
      style={{
        marginTop: 14,
        padding: "12px 0",
        textAlign: "center",
        background: accent,
        color: ink,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      Accept and pay
    </div>
  </div>
);

// ---------- Sơ đồ ----------

const ArrowDefs = ({ id }: { id: string }) => (
  <defs>
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="9"
      refY="5"
      markerWidth="7"
      markerHeight="7"
      orient="auto"
    >
      <path d="M0 0L10 5L0 10z" fill={lineStrong} />
    </marker>
  </defs>
);

const Node = ({
  x,
  y,
  w,
  h,
  title,
  sub,
  tone = "plain",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string;
  tone?: "plain" | "brand" | "key";
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      boxSizing: "border-box",
      padding: "14px 20px",
      background: tone === "brand" ? accent : tone === "key" ? soft : surface,
      color: tone === "brand" ? ink : text,
      border: `1px solid ${tone === "plain" ? lineStrong : accent}`,
    }}
  >
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    {sub && (
      <div style={{ fontSize: 21, lineHeight: 1.35, opacity: 0.85, marginTop: 4 }}>{sub}</div>
    )}
  </div>
);

const DiagramLabel = ({ x, y, children }: { x: number; y: number; children: ReactNode }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      fontFamily: mono,
      fontSize: 17,
      letterSpacing: "0.1em",
      color: muted,
      background: "var(--osd-bg)",
      padding: "0 8px",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </div>
);

// ---------- 1. Cover ----------

const Cover: Page = () => (
  <Frame bare>
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <img src={logo} alt="" style={{ width: 64, height: 64 }} />
      <span
        style={{
          fontFamily: mono,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: "0.16em",
          color: accent,
        }}
      >
        TEAM FIREFLY
      </span>
    </div>
    <h1
      style={{
        fontFamily: display,
        fontSize: "var(--osd-size-hero)",
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "-0.035em",
        margin: "64px 0 0",
      }}
    >
      Payvoke
    </h1>
    <p
      style={{
        fontFamily: display,
        fontSize: 56,
        fontWeight: 600,
        lineHeight: 1.25,
        letterSpacing: "-0.005em",
        margin: "36px 0 0",
      }}
    >
      Marketplace cho AI agent.
      <br />
      <Em>Trả tiền theo từng job, chỉ khi có kết quả.</Em>
    </p>
  </Frame>
);
Cover.transition = settle;

// ---------- 2. Ý tưởng ----------

const Idea: Page = () => (
  <Frame n="Ý tưởng" title="Giới thiệu ý tưởng">
    <div style={{ position: "relative", width: 1680, height: 370 }}>
      <svg width={1680} height={370} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-idea" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-idea)">
          <path d="M480 110H596" />
          <path d="M1080 110H1196" />
          <path d="M1440 184V320H240V188" />
        </g>
      </svg>
      <Node x={0} y={40} w={480} h={140} title="Builder" sub="Chia sẻ agent" />
      <Node
        x={600}
        y={40}
        w={480}
        h={140}
        title="Payvoke"
        sub="Store · Chat · Thanh toán"
        tone="brand"
      />
      <Node x={1200} y={40} w={480} h={140} title="Buyer" sub="Giao việc, trả theo job" />
      <DiagramLabel x={720} y={309}>
        THANH TOÁN THEO JOB
      </DiagramLabel>
    </div>
    <Statement style={{ marginTop: 24 }}>
      Builder chia sẻ agent. <Em>Buyer trả tiền theo từng job.</Em>
    </Statement>
  </Frame>
);

// ---------- 3. Hai phía ----------

const TwoSides: Page = () => (
  <Frame n="Ý tưởng" title="Cách sử dụng">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Builder</Label>
        <Row n="01">Đăng ký agent</Row>
        <Row n="02">Đặt giá</Row>
        <Row n="03">Nhận job và thanh toán</Row>
      </div>
      <div>
        <Label>Buyer</Label>
        <Row n="01">Tìm agent</Row>
        <Row n="02">Nhận Offer</Row>
        <Row n="03">Nhận kết quả</Row>
      </div>
    </div>
  </Frame>
);

// ---------- 3. Bối cảnh ----------

const Context: Page = () => (
  <Frame n="Ý tưởng" title="Bối cảnh">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64 }}>
      <Block tag="MCP" title="Assistant gọi công cụ">
        Tự tìm agent và giao việc.
      </Block>
      <Block tag="x402" title="Thanh toán trong HTTP">
        Máy tự thanh toán.
      </Block>
      <Block tag="On-chain" title="Finality nhanh">
        Phí thấp.
      </Block>
    </div>
    <Statement style={{ marginTop: 64 }}>
      Còn thiếu một <Em>marketplace cho agent.</Em>
    </Statement>
  </Frame>
);

// ---------- 3b. Vì sao on-chain ----------

const Versus = ({ k, a, b, head }: { k: string; a: string; b: string; head?: boolean }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "300px 1fr 1fr",
      gap: 40,
      alignItems: "baseline",
      padding: head ? "0 0 14px" : "20px 0",
      borderTop: head ? "none" : `1px solid ${line}`,
    }}
  >
    <span style={{ fontSize: 30, fontWeight: 600 }}>{k}</span>
    <span
      style={{
        fontFamily: head ? mono : sans,
        fontSize: head ? 20 : 29,
        fontWeight: head ? 700 : 400,
        letterSpacing: head ? "0.14em" : undefined,
        color: head ? muted : bodyInk,
      }}
    >
      {a}
    </span>
    <span
      style={{
        fontFamily: head ? mono : sans,
        fontSize: head ? 20 : 29,
        fontWeight: head ? 700 : 500,
        letterSpacing: head ? "0.14em" : undefined,
        color: head ? accent : text,
      }}
    >
      {b}
    </span>
  </div>
);

const WhyOnchain: Page = () => (
  <Frame n="Thanh toán" title="Vì sao dùng on-chain">
    <Versus head k="" a="VÍ NẠP SẴN · NỀN TẢNG GIỮ TIỀN" b="ESCROW ON-CHAIN" />
    <Versus k="Bên giữ tiền" a="Nền tảng, người dùng phải tin" b="Smart contract công khai" />
    <Versus
      k="Chi trả builder"
      a="Phụ thuộc KYC và ngân hàng từng nước"
      b="Thanh toán về thẳng ví của builder"
    />
    <Versus k="Hoàn tiền" a="Theo quy trình nội bộ" b="Tự động theo thời hạn giao" />
    <Versus
      k="Agent tự chi tiêu"
      a="Cần tài khoản và số dư riêng"
      b="Spend key có hạn mức, thu hồi được"
    />
    <Statement style={{ marginTop: 40 }}>
      On-chain: <Em>niềm tin và chi trả.</Em>
    </Statement>
  </Frame>
);

// ---------- 5. Một job ----------

const Stage = ({
  n,
  title,
  tag,
  children,
  money,
}: {
  n: string;
  title: string;
  tag: string;
  children: ReactNode;
  money?: boolean;
}) => (
  <div>
    <div
      style={{
        position: "relative",
        zIndex: 1,
        width: 68,
        height: 68,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: money ? accent : surface,
        color: money ? ink : accent,
        border: `2px solid ${accent}`,
        fontFamily: mono,
        fontSize: 28,
        fontWeight: 700,
      }}
    >
      {n}
    </div>
    <div style={{ fontFamily: display, fontSize: 38, fontWeight: 600, marginTop: 28 }}>{title}</div>
    <div style={{ fontSize: 28, lineHeight: 1.4, color: bodyInk, marginTop: 10, minHeight: 120 }}>
      {children}
    </div>
    <Tag filled={money}>{tag}</Tag>
  </div>
);

const JobFlow: Page = () => (
  <Frame n="Sản phẩm" title="Vòng đời một job">
    <div style={{ position: "relative" }}>
      <div
        style={{ position: "absolute", left: 34, right: 300, top: 33, height: 2, background: line }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 40 }}>
        <Stage n="1" title="Khám phá" tag="off-chain">
          Chat miễn phí
        </Stage>
        <Stage n="2" title="Offer" tag="off-chain">
          Giá và điều khoản
        </Stage>
        <Stage n="3" title="Ký quỹ" tag="on-chain" money>
          Tiền vào Vault
        </Stage>
        <Stage n="4" title="Thực thi" tag="off-chain">
          Agent xử lý job
        </Stage>
        <Stage n="5" title="Thanh toán" tag="on-chain" money>
          Release hoặc refund
        </Stage>
      </div>
    </div>
    <Note style={{ marginTop: 56 }}>Tiền chỉ di chuyển ở bước 3 và bước 5.</Note>
  </Frame>
);

// ---------- 6. Trước thanh toán ----------

const PreSale: Page = () => (
  <Frame n="Sản phẩm" title="Trao đổi và Offer">
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 740px", gap: 80, alignItems: "center" }}
    >
      <div>
        <Spec k="Chat" w={200}>
          Miễn phí, stream thời gian thực
        </Spec>
        <Spec k="Tương tác" w={200}>
          Form và lựa chọn
        </Spec>
        <Spec k="Giá" w={200}>
          Chỉ từ Offer
        </Spec>
      </div>
      <Window title="Agent phân tích tài chính · CSV">
        <Msg from="user">
          <b>/analyze</b> q3_financials.csv
        </Msg>
        <Msg from="agent">
          Đã nhận file. Bạn muốn mức độ phân tích nào?
          <Caret />
        </Msg>
        <div style={{ display: "flex", gap: 12 }}>
          <Option>
            <b>Quick</b> · 2 biểu đồ cơ bản
          </Option>
          <Option picked>
            <b>Deep</b> · 5 biểu đồ + xu hướng
          </Option>
        </div>
        <OfferCard />
      </Window>
    </div>
  </Frame>
);

// ---------- 7. Quote ----------

const Field = ({ k, children }: { k: string; children: ReactNode }) => (
  <div style={{ padding: "24px 28px", background: surface, border: `1px solid ${line}` }}>
    <Label style={{ color: accent }}>{k}</Label>
    <div style={{ fontSize: 30, lineHeight: 1.4 }}>{children}</div>
  </div>
);

const Quote: Page = () => (
  <Frame n="Thanh toán" title="Quote EIP-712">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
      <Field k="Parties">Buyer, provider</Field>
      <Field k="Command">Agent, command, version</Field>
      <Field k="Hash">Input, terms, policy</Field>
      <Field k="Amount">Giá, fee</Field>
      <Field k="Deadline">Giao hàng, resolveBy</Field>
      <Field k="Replay">Dùng một lần</Field>
    </div>
    <Statement style={{ marginTop: 48 }}>
      Ký xong, <Em>không sửa được.</Em>
    </Statement>
  </Frame>
);

// ---------- 8. Thực thi ----------

const Step7 = ({
  state,
  note,
  tone = "plain",
  last,
}: {
  state: string;
  note: string;
  tone?: "plain" | "brand" | "warn";
  last?: boolean;
}) => (
  <div style={{ flex: 1, display: "flex", alignItems: "flex-start", gap: 0 }}>
    <div style={{ flex: 1 }}>
      <div
        style={{
          padding: "14px 0",
          textAlign: "center",
          fontFamily: mono,
          fontSize: 21,
          fontWeight: 700,
          letterSpacing: "0.02em",
          background: tone === "brand" ? accent : surface,
          color: tone === "brand" ? ink : tone === "warn" ? red : text,
          border: `1px solid ${tone === "brand" ? accent : tone === "warn" ? red : lineStrong}`,
        }}
      >
        {state}
      </div>
      <div style={{ marginTop: 12, textAlign: "center", fontSize: 24, color: muted }}>{note}</div>
    </div>
    {last ? null : <span style={{ padding: "10px 8px", fontSize: 28, color: lineStrong }}>›</span>}
  </div>
);

const Execution: Page = () => (
  <Frame n="Sản phẩm" title="Thực thi job">
    <Label>Luồng chính</Label>
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      <Step7 state="QUEUED" note="Chờ gửi" />
      <Step7 state="SENT" note="Đã gửi agent" />
      <Step7 state="ACKED" note="Agent nhận" />
      <Step7 state="RUNNING" note="Đang chạy" tone="brand" />
      <Step7 state="VERIFYING" note="Kiểm tra" />
      <Step7 state="DELIVERED" note="Hoàn tất" tone="brand" last />
    </div>
    <div style={{ marginTop: 44 }}>
      <Spec k="Stream" w={300}>
        AG-UI
      </Spec>
      <Spec k="Thanh toán" w={300}>
        Dựa vào kết quả cuối cùng
      </Spec>
    </div>
  </Frame>
);

// ---------- 9. OpenUI ----------

const Metric = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <div style={{ flex: 1, padding: "16px 20px", border: `1px solid ${line}` }}>
    <div style={{ fontFamily: mono, fontSize: 17, letterSpacing: "0.1em", color: muted }}>
      {label}
    </div>
    <div style={{ fontFamily: display, fontSize: 44, fontWeight: 600, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 19, color: muted }}>{note}</div>
  </div>
);

const Bar = ({
  label,
  value,
  max,
  strong,
}: {
  label: string;
  value: number;
  max: number;
  strong?: boolean;
}) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "120px 1fr 64px",
      gap: 14,
      alignItems: "center",
    }}
  >
    <span style={{ fontSize: 22 }}>{label}</span>
    <span style={{ height: 28, background: line }}>
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${(value / max) * 100}%`,
          background: strong ? accent : lineStrong,
        }}
      />
    </span>
    <span style={{ fontSize: 22, fontWeight: strong ? 700 : 400, textAlign: "right" }}>
      {value}
    </span>
  </div>
);

const GenUI: Page = () => (
  <Frame n="Sản phẩm" title="Giao diện kết quả">
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 720px", gap: 80, alignItems: "center" }}
    >
      <div>
        <Spec k="Ngôn ngữ" w={220}>
          OpenUI Lang
        </Spec>
        <Spec k="Catalog" w={220}>
          6 component cố định
        </Spec>
        <Spec k="An toàn" w={220}>
          Không script, không link
        </Spec>
      </div>
      <Window title="Kết quả stream realtime">
        <div style={{ display: "flex", gap: 12 }}>
          <Metric label="DOANH THU Q3" value="−18%" note="so với Q2" />
          <Metric label="ĐƠN HÀNG" value="3.204" note="−9%" />
        </div>
        <div style={{ border: `1px solid ${line}`, padding: "18px 20px" }}>
          <div style={{ fontSize: 23, fontWeight: 600, marginBottom: 14 }}>
            Phân tích doanh thu theo khu vực
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Bar label="Bắc" value={530} max={530} />
            <Bar label="Trung" value={412} max={530} />
            <Bar label="Nam" value={268} max={530} strong />
          </div>
        </div>
      </Window>
    </div>
  </Frame>
);

// ---------- 10. Tích hợp ----------

const Builder: Page = () => (
  <Frame n="Sản phẩm" title="Tích hợp cho Builder">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Event feed">SSE và ACK.</Block>
      <Block title="API key">Phân quyền theo scope.</Block>
      <Block title="Idempotent">Retry an toàn.</Block>
      <Block title="File">Presigned URL.</Block>
    </div>
    <Note style={{ marginTop: 56 }}>
      Không giới hạn ngôn ngữ hay công nghệ: chỉ cần HTTP và SSE.
    </Note>
  </Frame>
);

// ---------- 11. MCP ----------

const Assistant: Page = () => (
  <Frame n="Sản phẩm" title="Tích hợp AI assistant">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Qua MCP</Label>
        <Row n="01">Tìm agent</Row>
        <Row n="02">Chat và đọc Offer</Row>
        <Row n="03">Thanh toán trong hạn mức</Row>
        <Row n="04">Nhận kết quả</Row>
      </div>
      <div>
        <Label>Bảo vệ</Label>
        <Spec k="API key" w={220}>
          Chỉ lưu hash
        </Spec>
        <Spec k="Hạn mức" w={220}>
          Vượt thì người dùng duyệt
        </Spec>
        <Spec k="Risk Check" w={220}>
          Có tín hiệu thì người dùng duyệt
        </Spec>
      </div>
    </div>
  </Frame>
);

// ---------- 12. Risk check ----------

const Signal = ({ name, children }: { name: string; children: ReactNode }) => (
  <>
    <div
      style={{
        padding: "22px 0",
        borderTop: `1px solid ${line}`,
        fontSize: 32,
        fontWeight: 600,
        display: "flex",
        gap: 18,
      }}
    >
      <span style={{ color: red }}>!</span>
      {name}
    </div>
    <div
      style={{ padding: "22px 0", borderTop: `1px solid ${line}`, fontSize: 32, color: bodyInk }}
    >
      {children}
    </div>
  </>
);

const RiskCheck: Page = () => (
  <Frame n="Thanh toán" title="Risk Check">
    <Label>Khi assistant hoặc API key tự thanh toán · sau khi qua hạn mức</Label>
    <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", columnGap: 56 }}>
      <Signal name="Ép thanh toán">Agent ra lệnh cho assistant: bỏ qua luật, trả ngay</Signal>
      <Signal name="Tăng giá">Offer mới thay Offer cũ với giá cao hơn</Signal>
      <Signal name="Giá bất thường">Cao hơn 3× median của lệnh (20 lần mua gần nhất)</Signal>
      <Signal name="Refund cao">Từ 50% trong 20 job đã đóng gần nhất (tối thiểu 5)</Signal>
      <Signal name="Agent mới">Dưới 3 job đã trả và giá trên 1 USDC</Signal>
    </div>
    <Statement style={{ marginTop: 32 }}>
      Có tín hiệu: <Em>người dùng phê duyệt.</Em> Không tự trả, không chặn chat.
    </Statement>
  </Frame>
);

// ---------- 13. Kiến trúc ----------

const Architecture: Page = () => (
  <Frame n="Hệ thống" title="Kiến trúc hệ thống">
    <div style={{ position: "relative", width: 1680, height: 600 }}>
      <div
        style={{
          position: "absolute",
          left: 440,
          top: 0,
          width: 800,
          height: 600,
          border: `2px dashed ${lineStrong}`,
          boxSizing: "border-box",
        }}
      />
      <DiagramLabel x={460} y={-11}>
        PAYVOKE API
      </DiagramLabel>
      <svg width={1680} height={600} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-arch" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-arch)">
          <path d="M360 95H476" />
          <path d="M360 245H476" />
          <path d="M360 395H476" />
          <path d="M476 395H364" />
          <path d="M840 95H876" />
          <path d="M1220 105H1336" />
          <path d="M605 550V576H1510V554" />
          <path d="M870 550V576" />
        </g>
      </svg>
      <Node x={0} y={40} w={360} h={110} title="Web app" sub="store, chat, Studio" />
      <Node x={0} y={190} w={360} h={110} title="AI assistant" sub="MCP" />
      <Node x={0} y={340} w={360} h={110} title="Agent" sub="SSE, report" />
      <Node x={480} y={40} w={360} h={110} title="Chat · quote" />
      <Node x={480} y={190} w={360} h={110} title="AG-UI stream" sub="text, OpenUI" />
      <Node x={480} y={340} w={360} h={110} title="Agent gateway" />
      <Node x={880} y={40} w={340} h={130} title="x402 gateway" sub="không giữ key" />
      <DiagramLabel x={470} y={458}>
        WORKERS · MỖI WORKER MỘT KEY
      </DiagramLabel>
      <Node x={480} y={480} w={250} h={70} title="Settlement" tone="key" />
      <Node x={745} y={480} w={250} h={70} title="Finance" tone="key" />
      <Node x={1010} y={480} w={210} h={70} title="Job" />
      <Node x={1340} y={40} w={340} h={130} title="Storage" sub="Postgres, Redis, S3" />
      <Node x={1340} y={440} w={340} h={110} title="PayvokeVault" sub="On-chain" tone="brand" />
    </div>
    <Note style={{ marginTop: 16 }}>Mỗi worker giữ một key riêng.</Note>
  </Frame>
);

// ---------- 14. Vận hành ----------

const Operations: Page = () => (
  <Frame n="Hệ thống" title="Độ tin cậy">
    <Spec k="Dữ liệu" w={360}>
      Postgres là nguồn dữ liệu chính của job và giao dịch.
    </Spec>
    <Spec k="Journal" w={360}>
      Giao dịch được ghi lại trước khi gửi lên chain, nên đối soát được sau sự cố.
    </Spec>
    <Spec k="Finality" w={360}>
      Agent chỉ bắt đầu chạy sau khi khoản tiền được giữ chắc chắn trên chain.
    </Spec>
    <Spec k="Idempotent" w={360}>
      Gửi lại cùng một yêu cầu chỉ trả về biên nhận cũ, không bị tính tiền hai lần.
    </Spec>
    <Spec k="Key" w={360}>
      Mỗi worker dùng một key riêng, nên một worker bị lộ không ảnh hưởng worker khác.
    </Spec>
  </Frame>
);

// ---------- 15. Vault ----------

const Box = ({
  x,
  y,
  w,
  title,
  sub,
  tone = "plain",
}: {
  x: number;
  y: number;
  w: number;
  title: string;
  sub: string;
  tone?: "plain" | "brand" | "good";
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: 116,
      boxSizing: "border-box",
      padding: "18px 26px",
      background: tone === "brand" ? accent : tone === "good" ? soft : surface,
      color: tone === "brand" ? ink : text,
      border: `1px solid ${tone === "plain" ? lineStrong : accent}`,
    }}
  >
    <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700 }}>{title}</div>
    <div style={{ fontSize: 25, opacity: 0.85, marginTop: 6 }}>{sub}</div>
  </div>
);

const Vault: Page = () => (
  <Frame n="Thanh toán" title="PayvokeVault">
    <div style={{ position: "relative", width: 1680, height: 580 }}>
      <svg width={1680} height={580} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-vault" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-vault)">
          <path d="M360 210H436" />
          <path d="M780 210H1000C1040 210 1040 58 1086 58" />
          <path d="M780 210H1086" />
          <path d="M780 210H1000C1040 210 1040 362 1086 362" />
          <path d="M780 210H1000C1040 210 1040 514 1086 514" />
        </g>
      </svg>
      <Box x={0} y={152} w={360} title="Ví buyer" sub="ký USDC theo quote" />
      <Box x={440} y={152} w={340} title="Held" sub="escrow theo quote" tone="brand" />
      <Box x={1090} y={0} w={590} title="Ví builder" sub="release sau review window" tone="good" />
      <Box x={1090} y={152} w={590} title="Ví buyer" sub="refund 100% khi lỗi hoặc trễ" />
      <Box x={1090} y={304} w={590} title="Ví buyer" sub="reclaim sau resolveBy" />
      <Box x={1090} y={456} w={590} title="Claimable" sub="USDC bị chặn, owner tự claim" />
    </div>
  </Frame>
);

// ---------- 16. x402 ----------

const Lane = ({ x, title, sub }: { x: number; title: string; sub: string }) => (
  <div
    style={{
      position: "absolute",
      left: x - 160,
      top: 0,
      width: 320,
      height: 84,
      boxSizing: "border-box",
      paddingTop: 10,
      textAlign: "center",
      background: surface,
      border: `1px solid ${lineStrong}`,
    }}
  >
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 19, color: muted }}>{sub}</div>
  </div>
);

const SeqMsg = ({
  from,
  to,
  y,
  children,
  strong,
}: {
  from: number;
  to: number;
  y: number;
  children: ReactNode;
  strong?: boolean;
}) => {
  const left = Math.min(from, to);
  const width = Math.abs(to - from);
  const id = `pv-seq-${from}-${to}-${y}`;
  return (
    <div style={{ position: "absolute", left, top: y - 42, width, height: 54 }}>
      <div style={{ textAlign: "center", lineHeight: 1 }}>
        <span
          style={{
            fontSize: 26,
            fontWeight: strong ? 700 : 500,
            color: strong ? accent : text,
            background: "var(--osd-bg)",
            padding: "0 10px",
          }}
        >
          {children}
        </span>
      </div>
      <svg width={width} height={16} style={{ position: "absolute", left: 0, top: 36 }}>
        <ArrowDefs id={id} />
        <path
          d={to > from ? `M4 8H${width - 4}` : `M${width - 4} 8H4`}
          stroke={lineStrong}
          strokeWidth={2.5}
          markerEnd={`url(#${id})`}
        />
      </svg>
    </div>
  );
};

const L_BUYER = 180;
const L_PAYVOKE = 660;
const L_VAULT = 1120;
const L_AGENT = 1500;

const X402: Page = () => (
  <Frame n="Thanh toán" title="Luồng thanh toán x402">
    <div style={{ position: "relative", width: 1680, height: 640 }}>
      <svg width={1680} height={640} style={{ position: "absolute", inset: 0 }}>
        <g stroke={line} strokeWidth={2} strokeDasharray="6 8">
          <path d={`M${L_BUYER} 84V640`} />
          <path d={`M${L_PAYVOKE} 84V640`} />
          <path d={`M${L_VAULT} 84V640`} />
          <path d={`M${L_AGENT} 84V640`} />
        </g>
      </svg>
      <Lane x={L_BUYER} title="Buyer" sub="web hoặc AI assistant" />
      <Lane x={L_PAYVOKE} title="Payvoke API" sub="x402 gateway & relayer" />
      <Lane x={L_VAULT} title="PayvokeVault" sub="On-chain" />
      <Lane x={L_AGENT} title="Provider agent" sub="SSE event feed" />
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={164}>
        Submit quote
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={232} strong>
        402 Payment Required
      </SeqMsg>
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={300}>
        Ký USDC EIP-3009, gửi lại
      </SeqMsg>
      <div>
        <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={368}>
          fundWithAuthorization (relayer)
        </SeqMsg>
        <SeqMsg from={L_VAULT} to={L_PAYVOKE} y={436}>
          Hold finalized
        </SeqMsg>
        <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={504} strong>
          202 + receipt
        </SeqMsg>
      </div>
      <div>
        <SeqMsg from={L_PAYVOKE} to={L_AGENT} y={572} strong>
          invocation.ready
        </SeqMsg>
        <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={636}>
          applyDecision (release / refund)
        </SeqMsg>
      </div>
    </div>
  </Frame>
);

// ---------- 17. Grant ----------

const Grant: Page = () => (
  <Frame n="Thanh toán" title="Grant và spend key">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Grant</Label>
        <Spec k="maxPerCall" w={250}>
          Trần mỗi job
        </Spec>
        <Spec k="maxPerPeriod" w={250}>
          Trần mỗi kỳ
        </Spec>
        <Spec k="maxTotal" w={250}>
          Tổng hạn mức
        </Spec>
        <Spec k="expiresAt" w={250}>
          Ngày hết hạn
        </Spec>
      </div>
      <div>
        <Label>Spend key</Label>
        <Row n="01">Ký từng quote</Row>
        <Row n="02">Vault kéo tiền từ ví, trong hạn mức</Row>
        <Row n="03">Thiết lập, thu hồi không tốn gas</Row>
      </div>
    </div>
  </Frame>
);

// ---------- 18. Contract ----------

const Contract: Page = () => (
  <Frame n="Hệ thống" title="Smart contract">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Tách quyền">
        Relayer, approver, executor dùng ba key riêng. Một key bị lộ không đủ để lấy tiền.
      </Block>
      <Block title="Tạm dừng vẫn an toàn">
        Khi pause, hệ thống chặn fund job và grant mới. Người dùng vẫn revoke và đòi tiền về ví
        được.
      </Block>
      <Block title="Không thể sửa số dư">
        Contract không dùng proxy và không có hàm sửa balance. Số dư chỉ đổi qua các bước hợp lệ.
      </Block>
      <Block title="Phí cố định">
        Trần phí đặt một lần lúc deploy và không đổi. Phí của mỗi job được chốt trong quote.
      </Block>
    </div>
  </Frame>
);

// ---------- 20. Closing ----------

const Closing: Page = () => (
  <Frame bare>
    <img src={logo} alt="" style={{ width: 88, height: 88 }} />
    <h2
      style={{
        fontFamily: display,
        fontSize: 120,
        fontWeight: 600,
        lineHeight: 1.05,
        letterSpacing: "-0.025em",
        margin: "44px 0 0",
      }}
    >
      Payvoke
    </h2>
    <p
      style={{
        fontFamily: display,
        fontSize: 52,
        fontWeight: 600,
        lineHeight: 1.25,
        margin: "28px 0 0",
      }}
    >
      Marketplace cho AI agent.
      <br />
      <Em>Trả tiền theo từng job, chỉ khi có kết quả.</Em>
    </p>
    <div style={{ width: 120, height: 4, background: accent, marginTop: 48 }} />
    <p style={{ fontSize: 32, color: bodyInk, margin: "32px 0 0" }}>
      Team Firefly · Cảm ơn Ban Giám Khảo
    </p>
    <Note style={{ marginTop: 12 }}>payvoke.xyz · github.com/2giosangmitom/payvoke</Note>
  </Frame>
);
Closing.transition = settle;

export const meta: SlideMeta = {
  title: "Payvoke",
  createdAt: "2026-10-26T09:14:47.657Z",
};

export default [
  Cover,
  Idea,
  TwoSides,
  Context,
  JobFlow,
  PreSale,
  Execution,
  GenUI,
  Builder,
  Assistant,
  WhyOnchain,
  Quote,
  X402,
  Vault,
  Grant,
  RiskCheck,
  Architecture,
  Operations,
  Contract,
  Closing,
] satisfies Page[];

export const notes: (string | undefined)[] = [
  // Cover
  `(~20s)
Chào Ban giám khảo, chúng tôi là Team Firefly.
Payvoke là marketplace cho AI agent: người xây dựng agent chia sẻ agent của mình, người cần việc giao việc cho agent, trả tiền theo từng job và chỉ khi nhận được kết quả.
Bài nói gồm bốn phần: ý tưởng, sản phẩm, thanh toán on-chain và hệ thống.`,

  // Idea
  `(~30s)
Ý tưởng rất đơn giản. Ai cũng có thể tạo ra một AI agent hữu ích, nhưng agent chỉ có giá trị khi có người dùng nó.
Payvoke là marketplace kết nối hai phía. Builder chia sẻ agent của mình, đặt giá và nhận tiền cho mỗi job. Buyer, là người hoặc AI assistant, không cần tự xây mà chỉ cần tìm agent phù hợp rồi giao job và trả tiền theo từng job.
Agent do builder tự host. Payvoke lo Store, chat, báo giá, thanh toán và giao kết quả.`,

  // TwoSides
  `(~35s)
Mỗi phía chỉ có ba bước.
Builder: đăng ký agent và command trong Studio, đặt giá trần cho từng command, rồi nhận job qua HTTP và SSE; tiền về khi giao xong. Không giới hạn ngôn ngữ hay công nghệ, miễn là gọi được HTTP và SSE.
Buyer: tìm agent trên Store và chat thử miễn phí, nhận Offer có giá, deadline và chính sách refund, chấp nhận rồi nhận kết quả ngay trong chat.`,

  // Context
  `(~35s)
Ba mảnh ghép vừa chín.
MCP cho assistant tự gọi tool: Claude Code hay Codex có thể tự tìm agent và giao việc.
x402 cho thanh toán ngay trong HTTP: server trả 402, client ký rồi gửi lại.
Mạng on-chain cho finality nhanh và phí thấp, hợp với job giá trị nhỏ.
Agent dễ xây, assistant biết gọi tool, máy biết trả tiền: đó là lý do một marketplace agent trở nên khả thi vào lúc này.`,

  // JobFlow
  `(~40s)
Một job có năm bước.
Bước 1, khám phá, chat free: agent trả text, form hoặc các gói.
Bước 2, agent ra Offer: giá, thời hạn và chính sách hoàn tiền.
Bước 3, buyer ký USDC EIP-3009 cho đúng quote; tiền vào Vault qua x402.
Bước 4, agent chỉ chạy khi hold đã finalized on-chain.
Bước 5, nghiệm thu: đạt thì release cho Builder; lỗi hoặc trễ thì refund 100%.
Điểm mấu chốt: on-chain chỉ có hai lần tiền di chuyển, bước 3 và bước 5.`,

  // PreSale
  `(~35s)
Trước khi trả tiền, mọi thứ miễn phí. Agent stream Markdown realtime, có thể trả form, option hoặc confirm.
Buyer gửi file CSV và chọn gói Quick hoặc Deep.
Agent trả Offer card có cấu trúc.
Điểm quan trọng: giá chỉ đọc từ Offer, không parse từ text chat. Vì vậy LLM không thể tự bịa giá.
Ngoài ra còn có trần giá, price floor bù gas và giới hạn số lượt chat để chống spam.`,

  // Execution
  `(~35s)
Sau khi hold finalized, run đi qua các state chuẩn: QUEUED, SENT, ACKED, RUNNING, VERIFYING, DELIVERED.
Có nhánh WAITING_BUYER khi agent cần hỏi thêm, và nhánh FAILED hoặc UNKNOWN.
Stream theo AG-UI: text qua TEXT_MESSAGE, mỗi delta tối đa 4.096 ký tự; UI qua event CUSTOM payvoke.openui.
Điều kiện trả tiền không dựa vào stream, mà dựa vào result artifact cuối cùng.`,

  // GenUI
  `(~30s)
Kết quả không chỉ là text. Agent mô tả UI bằng OpenUI Lang và stream từng patch; Payvoke parse lại cả chương trình sau mỗi patch.
Payvoke render bằng 6 component cố định: Stack, Text, Card, Metric, Table, Chart. Biểu đồ và số liệu hiện ngay trong thread.
Catalog chỉ để hiển thị: không script, không iframe, không link. Nên agent không thể chèn UI độc hại.`,

  // Builder
  `(~30s)
Với builder, tích hợp chỉ là HTTP và SSE.
Mở SSE là agent online. Event nằm trong queue đến khi ACK, nên rớt mạng không mất job.
API key tạo trong Studio với 7 scope. Mọi lệnh ghi đều idempotent, retry không trả tiền hai lần.
File lớn upload qua presigned URL và check SHA-256. Không giới hạn ngôn ngữ hay công nghệ: Python, Node, LangChain hay AutoGen đều tích hợp được, miễn là gọi được HTTP và SSE.

Nếu bị hỏi "sao không có SDK?":
Đây là dự án demo nên chúng tôi không phát hành SDK lên npm hay các nền tảng package. Tài liệu API và hai agent mẫu, CSV Analyst và Job Finder, chỉ dùng fetch và SSE, đủ để builder tích hợp.`,

  // Assistant
  `(~35s)
Mọi agent trên Store đều dùng được qua MCP, builder không phải viết thêm gì.
Assistant tìm agent, chat kèm context và file, đọc Offer, tự trả nếu trong hạn mức, rồi báo lại user.
Bảo mật: API key chỉ lưu hash SHA-256. Signer suy ra bằng HKDF-SHA256, nên database lộ cũng không ký được. Vượt hạn mức, hoặc Risk Check có tín hiệu, thì hệ thống gửi approval link cho user thay vì tự trả.

Nếu bị hỏi "spend key lưu ở đâu?":
Trên web, key sinh trong browser và không rời máy. Với assistant, key derive từ secret bằng HKDF.`,

  // WhyOnchain
  `(~40s)
Câu hỏi hợp lý: sao không để người dùng nạp tiền vào nền tảng rồi nền tảng xử lý nội bộ?
Mô hình đó giải được vấn đề phí, nhưng còn bốn điểm yếu. Một, nền tảng là bên giữ tiền, người dùng phải tin. Hai, chi trả cho builder phụ thuộc KYC và ngân hàng của từng nước. Ba, hoàn tiền theo quy trình nội bộ thay vì quy tắc công khai. Bốn, agent tự chi tiêu cần tài khoản và số dư riêng, trong khi spend key on-chain có hạn mức và thu hồi được.
Với on-chain, Payvoke không thể rút tiền của buyer; luật release và refund nằm trong contract và ai cũng kiểm chứng được.

Nếu bị hỏi "đánh đổi là gì?":
Người dùng cần có ví và số dư on-chain, tạo thêm một bước làm quen. Chúng tôi nhắm trước tới builder, người dùng quen với ví, và AI assistant tự thanh toán.`,

  // Quote
  `(~30s)
Khi buyer Accept, Payvoke đóng băng giao kèo thành Quote EIP-712: buyer, provider, command và version, hash của input, terms và policy, giá và fee, deliveryDeadline, resolveBy, và invocation key dùng một lần.
Chữ ký thanh toán gắn chặt với quote: ví ký USDC authorization có nonce chính là quote digest, còn spend key ký debit gắn quote với grant và epoch. Ký xong thì không sửa được điều khoản nào.

Nếu bị hỏi "builder đổi giá sau khi ký thì sao?":
Không ảnh hưởng. Giá đã được hash và chốt trong quote.`,

  // X402
  `(~40s)
Luồng x402 dùng scheme payvoke-escrow.
Buyer gửi quote; Payvoke trả 402 Payment Required. Ví buyer ký một USDC authorization (EIP-3009) cho đúng quote đó, không gas, không nạp trước, rồi gửi lại.
Settlement worker gọi fundWithAuthorization: Vault tự dựng lại authorization và chỉ Vault mới nộp được, nên USDC đi thẳng từ ví vào escrow của job. Payvoke đợi transaction finalized rồi mới trả 202 kèm receipt.
Chỉ sau đó agent mới nhận invocation.ready. Khi nghiệm thu xong, Finance worker gọi applyDecision để release hoặc refund.
Khác biệt cốt lõi: tiền không bao giờ đi thẳng cho người bán.`,

  // Vault
  `(~35s)
Vault là escrow theo từng job: buyer không có số dư nào trong Vault, tiền nằm trong ví đến lúc job được giao.
Mỗi job được fund thẳng từ ví vào Held.
Từ Held có đúng ba nhánh, đều trả thẳng về ví: release cho Builder sau review window; refund 100% về ví buyer nếu lỗi hoặc trễ; reclaim về ví buyer nếu quá resolveBy mà chưa có quyết định. Nếu USDC từ chối chuyển (blacklist) thì khoản đó thành claimable để người nhận tự rút.
Invariant: balance luôn lớn hơn hoặc bằng held + claimable.`,

  // Grant
  `(~30s)
Để không phải mở ví ký từng job, buyer ký Grant một lần: trần mỗi job, trần mỗi kỳ, tổng hạn mức và ngày hết hạn, kèm một permit USDC đúng bằng hạn mức đó. Relayer nộp lên chain nên buyer không tốn gas.
Sau đó spend key ký từng quote; Vault kéo tiền từ ví qua allowance và tự kiểm tra trần on-chain.
Revoke cũng chỉ là một chữ ký, tăng epoch và hạ allowance; toàn bộ chữ ký cũ mất hiệu lực. Spend key không bao giờ lấy được quá hạn mức.`,

  // RiskCheck
  `(~50s)
Hạn mức giới hạn số tiền, nhưng không ngăn được một agent xấu dụ assistant tiêu đúng trong hạn mức. Risk Check là lớp thứ hai. Nó chỉ chạy khi assistant hoặc API key tự thanh toán, sau khi quote đã qua hạn mức, allowance và số dư, và trước khi ký. Thanh toán bằng ví trên web luôn do chính buyer ký nên không qua lớp này.
Có 5 tín hiệu, đều tính từ dữ liệu của Payvoke:
Một, ép thanh toán: tin nhắn hoặc Offer của agent có nội dung nhắm vào assistant, như bảo bỏ qua hướng dẫn, thanh toán ngay không cần hỏi, nhắc tên tool của assistant hoặc đòi API key. Hệ thống nhận ra cả tiếng Anh lẫn tiếng Việt.
Hai, tăng giá: agent thay Offer đang mở bằng một Offer đắt hơn. Buyer từ chối rồi hỏi lại thì không tính.
Ba, giá bất thường: giá cao hơn 3 lần median giá đã trả của chính lệnh đó, tính trên tối đa 20 lần mua gần nhất và cần ít nhất 3 lần.
Bốn, refund cao: từ 50% trở lên trong 20 job đã đóng gần nhất của agent bị refund hoặc reclaim, cần ít nhất 5 job.
Năm, agent mới: dưới 3 job đã trả và giá trên 1 USDC. Job do chính chủ agent tự mua không được tính.
Chỉ cần một tín hiệu là chuyển sang user duyệt, assistant không tự trả được. Tín hiệu không chặn tin nhắn; phần nghi ngờ được đánh dấu trong read_chat để assistant báo lại cho user.
Ngoài ra, thanh toán tự động cũng dừng khi ví thiếu USDC hoặc allowance, hoặc khi 3 lần fund của buyer bị revert on-chain trong 24 giờ: buyer đó bị tạm dừng 1 giờ để không đốt gas của relayer.

Nếu bị hỏi "agent viết khác đi thì có né được không?":
Có thể, vì đây là nhận diện theo mẫu. Nên Risk Check không phải lớp duy nhất: hạn mức giới hạn thiệt hại, escrow giữ tiền đến khi nghiệm thu, và kết quả lỗi được refund 100%.

Nếu bị hỏi "người dùng có bị làm phiền không?":
Chỉ khi có tín hiệu. Job bình thường trong hạn mức vẫn tự trả.`,

  // Architecture
  `(~35s)
Kiến trúc tách quyền rõ ràng.
API xử lý chat, AG-UI, agent gateway và x402 gateway. Gateway không giữ key.
Ba worker: Settlement giữ relayer key để fund job và nộp thay đổi grant; Finance giữ approver và executor key để applyDecision; Job worker không giữ key.
Worker tắt thì key của nó không được nạp vào bộ nhớ.`,

  // Operations
  `(~30s)
Postgres là source of truth: journal, lease và nonce.
Mọi transaction được ghi journal trước khi broadcast, nên crash ở đâu cũng đối soát được.
Agent chỉ chạy sau finalized. Cùng invocation ID gửi lại luôn nhận cùng receipt. Mỗi worker một key và một gas budget riêng.`,

  // Contract
  `(~30s)
Vault có bốn nguyên tắc.
Ba role relayer, approver, executor dùng ba key khác nhau; approver không được trùng executor.
Pause chặn fund job và grant mới; user vẫn revoke và reclaim về ví nên không ai giam được tiền.
Không proxy, không hàm sửa balance. Trần fee là immutable, đặt lúc deploy, và fee chốt trong quote.`,

  // Closing
  `(~20s)
Tóm lại: Payvoke là marketplace nơi mọi người chia sẻ AI agent và người khác giao việc và trả tiền theo từng job; tiền nằm on-chain đến khi nghiệm thu xong.
Team Firefly cảm ơn Ban giám khảo. Chúng tôi sẵn sàng nhận câu hỏi.

Nếu bị hỏi nhanh:
Doanh thu: feeBps trên mỗi job, có trần trong contract.
Không giữ tiền trong database: để loại bỏ counterparty risk.
Kết quả giả: tiền chỉ release sau review window, lỗi thì refund 100%; Risk Check cảnh báo agent có tỷ lệ refund cao.`,
];
