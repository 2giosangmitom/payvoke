import {
  type DesignSystem,
  type Page,
  type SlideMeta,
  type SlideTransition,
  Step,
  Steps,
  useSlidePageNumber,
} from "@open-slide/core";
import type { CSSProperties, ReactNode } from "react";
import logo from "./assets/logo.svg";

// Osaka Jade daylight. Nền phẳng, kẻ mảnh, một ý mỗi dòng.
export const design: DesignSystem = {
  palette: { bg: "#f6f8f7", text: "#14261e", accent: "#286346" },
  fonts: {
    display: '"Be Vietnam Pro", system-ui, sans-serif',
    body: '"Be Vietnam Pro", system-ui, sans-serif',
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
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap";
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
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: "-0.022em",
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
    <span style={{ fontSize: size, fontWeight: 700 }}>{k}</span>
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

const Block = ({
  title,
  children,
  tag,
}: {
  title: string;
  children: ReactNode;
  tag?: string;
}) => (
  <div style={{ borderTop: `3px solid ${accent}`, paddingTop: 26 }}>
    {tag && <Label style={{ color: accent }}>{tag}</Label>}
    <div style={{ fontFamily: display, fontSize: 40, fontWeight: 800, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 30, lineHeight: 1.45, color: bodyInk, marginTop: 12 }}>
      {children}
    </div>
  </div>
);

const Statement = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      padding: "26px 36px",
      background: soft,
      borderLeft: `6px solid ${accent}`,
      fontSize: 32,
      fontWeight: 700,
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
        fontWeight: 700,
      }}
    >
      <span style={{ width: 14, height: 14, background: accent }} />
      {title}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
      {children}
    </div>
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
      <b style={{ color: accent }}>1 USDC</b>
    </div>
    <div style={{ fontSize: 21, color: muted, marginTop: 6 }}>
      Delivery 10 phút · review 30 phút · lỗi refund
    </div>
    <div
      style={{
        marginTop: 14,
        padding: "12px 0",
        textAlign: "center",
        background: accent,
        color: ink,
        fontSize: 24,
        fontWeight: 700,
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
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>
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
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: "-0.045em",
        margin: "64px 0 0",
      }}
    >
      Payvoke
    </h1>
    <p
      style={{
        fontFamily: display,
        fontSize: 56,
        fontWeight: 700,
        lineHeight: 1.25,
        letterSpacing: "-0.015em",
        margin: "36px 0 0",
      }}
    >
      Hạ tầng thanh toán cho AI agent.
      <br />
      <Em>Thuê theo job · Escrow on-chain · Refund tự động.</Em>
    </p>
    <div
      style={{
        fontFamily: mono,
        fontSize: 22,
        letterSpacing: "0.14em",
        color: muted,
        marginTop: 48,
      }}
    >
      AVALANCHE FUJI TESTNET · TEST USDC
    </div>
  </Frame>
);
Cover.transition = settle;

// ---------- 2. Vấn đề ----------

const Problem: Page = () => (
  <Frame n="Phần 1" label="Vấn đề" title="Agent bán được việc, nhưng chưa thu được tiền">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Builder</Label>
        <Row n="01">Tự xây payment, refund, tranh chấp</Row>
        <Row n="02">Free trial tốn LLM, không dám mở</Row>
        <Row n="03">Buyer lạ ngại trả trước</Row>
      </div>
      <div>
        <Label>Buyer</Label>
        <Row n="01">Không có escrow giữ tiền</Row>
        <Row n="02">Agent trễ hoặc sai: khó đòi</Row>
        <Row n="03">Prompt injection dụ assistant trả tiền</Row>
      </div>
    </div>
    <Statement style={{ marginTop: 56 }}>
      Cả hai phía đều thiếu một lớp <Em>escrow đáng tin</Em>.
    </Statement>
  </Frame>
);

// ---------- 3. Bối cảnh ----------

const Context: Page = () => (
  <Frame n="Phần 1" label="Cơ hội" title="Ba mảnh ghép đã sẵn sàng">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64 }}>
      <Block tag="MCP" title="Assistant gọi tool">
        Claude Code, Codex tự thuê agent.
      </Block>
      <Block tag="x402" title="Trả tiền trong HTTP">
        Server trả 402, client ký rồi gửi lại.
      </Block>
      <Block tag="Avalanche" title="Finality vài giây">
        USDC, phí &lt; $0.01, hợp micro-job.
      </Block>
    </div>
    <Statement style={{ marginTop: 64 }}>
      x402 chỉ chuyển tiền thẳng. <Em>Payvoke thêm escrow và refund.</Em>
    </Statement>
  </Frame>
);

// ---------- 4. Sản phẩm ----------

const WhatIs: Page = () => (
  <Frame n="Phần 2" label="Sản phẩm" title="Ba bên, một lớp escrow">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64 }}>
      <Block tag="Builder" title="Chạy ở đâu cũng được">
        Đăng ký command, báo giá, stream kết quả.
      </Block>
      <Block tag="Buyer" title="Người hoặc AI assistant">
        Tìm trên Store, chat free, nhận kết quả.
      </Block>
      <Block tag="PayvokeVault" title="Escrow on-chain">
        Giữ USDC, tự release/refund.
      </Block>
    </div>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 64 }}>
      <Tag filled>Store</Tag>
      <Tag filled>Thread</Tag>
      <Tag filled>Offer</Tag>
      <Tag filled>x402 gateway</Tag>
      <Tag filled>Escrow</Tag>
      <Tag filled>Release / Refund</Tag>
      <Tag filled>MCP</Tag>
    </div>
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
    <div style={{ fontFamily: display, fontSize: 38, fontWeight: 800, marginTop: 28 }}>
      {title}
    </div>
    <div style={{ fontSize: 28, lineHeight: 1.4, color: bodyInk, marginTop: 10, minHeight: 120 }}>
      {children}
    </div>
    <Tag filled={money}>{tag}</Tag>
  </div>
);

const JobFlow: Page = () => (
  <Frame n="Phần 2" label="Vòng đời job" title="Một job, năm bước, hai lần tiền di chuyển">
    <div style={{ position: "relative" }}>
      <div
        style={{ position: "absolute", left: 34, right: 300, top: 33, height: 2, background: line }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 40 }}>
        <Steps>
          <Stage n="1" title="Discover" tag="chat free">
            Text, form, chọn gói.
          </Stage>
          <Step>
            <Stage n="2" title="Offer" tag="giá có cấu trúc">
              Giá USDC, deadline, refund.
            </Stage>
          </Step>
          <Step>
            <Stage n="3" title="Escrow" tag="x402 · EIP-712" money>
              Ký quote, USDC vào Vault.
            </Stage>
          </Step>
          <Step>
            <Stage n="4" title="Run" tag="AG-UI stream">
              Chỉ chạy khi hold finalized.
            </Stage>
          </Step>
          <Step>
            <Stage n="5" title="Settle" tag="release · refund" money>
              Đạt: trả Builder. Lỗi: hoàn Buyer.
            </Stage>
          </Step>
        </Steps>
      </div>
    </div>
    <Note style={{ marginTop: 56 }}>On-chain chỉ ở bước 3 và bước 5.</Note>
  </Frame>
);

// ---------- 6. Trước thanh toán ----------

const PreSale: Page = () => (
  <Frame n="Phần 2" label="Trước thanh toán" title="Chat free, giá lấy từ Offer">
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 740px", gap: 80, alignItems: "center" }}
    >
      <div>
        <Spec k="Phản hồi" w={200}>
          Markdown stream realtime
        </Spec>
        <Spec k="Tương tác" w={200}>
          Form, option, confirm
        </Spec>
        <Spec k="Giá" w={200}>
          Chỉ từ Offer, không parse text
        </Spec>
        <Spec k="Chặn spam" w={200}>
          Trần giá, price floor, giới hạn lượt chat
        </Spec>
      </div>
      <Window title="Agent phân tích tài chính · CSV">
        <Steps>
          <Msg from="user">
            <b>/analyze</b> q3_financials.csv
          </Msg>
          <Step>
            <Msg from="agent">
              Đã nhận file. Bạn muốn mức độ phân tích nào?
              <Caret />
            </Msg>
          </Step>
          <Step>
            <div style={{ display: "flex", gap: 12 }}>
              <Option>
                <b>Quick</b> · 2 biểu đồ cơ bản
              </Option>
              <Option picked>
                <b>Deep</b> · 5 biểu đồ + xu hướng
              </Option>
            </div>
          </Step>
          <Step>
            <OfferCard />
          </Step>
        </Steps>
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
  <Frame n="Phần 3" label="Quote · EIP-712" title="Quote EIP-712: ký là khóa">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
      <Field k="Parties">Buyer và provider</Field>
      <Field k="Command">Agent ID, command, version</Field>
      <Field k="Hash">keccak256 của input, terms, policy</Field>
      <Field k="Amount">USDC, giá, fee</Field>
      <Field k="Deadline">deliveryDeadline, resolveBy</Field>
      <Field k="Replay">Invocation key, dùng một lần</Field>
    </div>
    <Statement style={{ marginTop: 48 }}>
      Chữ ký gắn quote với <Em>grant và epoch</Em>.
    </Statement>
  </Frame>
);

// ---------- 8. Thực thi ----------

const Chip = ({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "brand" | "warn";
}) => (
  <span
    style={{
      padding: "12px 18px",
      fontFamily: mono,
      fontSize: 22,
      fontWeight: 700,
      background: tone === "brand" ? accent : surface,
      color: tone === "brand" ? ink : tone === "warn" ? red : text,
      border: `1px solid ${tone === "brand" ? accent : tone === "warn" ? red : lineStrong}`,
    }}
  >
    {children}
  </span>
);

const To = () => <span style={{ fontSize: 28, color: lineStrong }}>›</span>;

const Execution: Page = () => (
  <Frame n="Phần 2" label="Thực thi" title="Run có state, stream có chuẩn">
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Chip>QUEUED</Chip>
      <To />
      <Chip>SENT</Chip>
      <To />
      <Chip>ACKED</Chip>
      <To />
      <Chip tone="brand">RUNNING</Chip>
      <To />
      <Chip>VERIFYING</Chip>
      <To />
      <Chip tone="brand">DELIVERED</Chip>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
      <Label style={{ margin: "0 8px 0 0" }}>Nhánh phụ</Label>
      <Chip>WAITING_BUYER</Chip>
      <Chip tone="warn">FAILED</Chip>
      <Chip tone="warn">UNKNOWN</Chip>
    </div>
    <div style={{ marginTop: 44 }}>
      <Spec k="Text" w={280}>
        TEXT_MESSAGE, delta ≤ 4.096 ký tự
      </Spec>
      <Spec k="UI" w={280}>
        Event CUSTOM payvoke.openui
      </Spec>
      <Spec k="Hỏi giữa job" w={280}>
        WAITING_BUYER, không tính thêm phí
      </Spec>
      <Spec k="Điều kiện trả" w={280}>
        Result artifact, không dựa vào stream
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
    <div style={{ fontFamily: display, fontSize: 44, fontWeight: 800, marginTop: 2 }}>{value}</div>
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
    style={{ display: "grid", gridTemplateColumns: "120px 1fr 64px", gap: 14, alignItems: "center" }}
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
  <Frame n="Phần 2" label="Generative UI · OpenUI" title="Agent mô tả UI, Payvoke render">
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 720px", gap: 80, alignItems: "center" }}
    >
      <div>
        <Spec k="Ngôn ngữ" w={220}>
          OpenUI Lang, patch nối thêm
        </Spec>
        <Spec k="Catalog" w={220}>
          6 component cố định
        </Spec>
        <Spec k="An toàn" w={220}>
          Không script, iframe hay link
        </Spec>
        <Spec k="Validate" w={220}>
          Check schema từng patch
        </Spec>
      </div>
      <Window title="Kết quả stream realtime">
        <Steps>
          <div style={{ display: "flex", gap: 12 }}>
            <Metric label="DOANH THU Q3" value="−18%" note="so với Q2" />
            <Metric label="ĐƠN HÀNG" value="3.204" note="−9%" />
          </div>
          <Step>
            <div style={{ border: `1px solid ${line}`, padding: "18px 20px" }}>
              <div style={{ fontSize: 23, fontWeight: 700, marginBottom: 14 }}>
                Phân tích doanh thu theo khu vực
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Bar label="Bắc" value={530} max={530} />
                <Bar label="Trung" value={412} max={530} />
                <Bar label="Nam" value={268} max={530} strong />
              </div>
            </div>
          </Step>
        </Steps>
      </Window>
    </div>
  </Frame>
);

// ---------- 10. Tích hợp ----------

const Builder: Page = () => (
  <Frame n="Phần 2" label="Dành cho Builder" title="Tích hợp bằng HTTP và SSE">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Event feed">Mở SSE là online. Event giữ trong queue đến khi ACK.</Block>
      <Block title="API key">Tạo trong Studio, 7 scope riêng.</Block>
      <Block title="Idempotent">Retry an toàn, không trả tiền hai lần.</Block>
      <Block title="File">Upload qua presigned URL, check SHA-256.</Block>
    </div>
    <Note style={{ marginTop: 56 }}>Không cần SDK. Chạy với Python, Node, LangChain, AutoGen.</Note>
  </Frame>
);

// ---------- 11. MCP ----------

const Assistant: Page = () => (
  <Frame n="Phần 2" label="AI assistant · MCP" title="Assistant tự thuê agent qua MCP">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Assistant tự vận hành</Label>
        <Steps>
          <Row n="01">Tìm agent trên Store</Row>
          <Step>
            <Row n="02">Chat kèm context và file</Row>
          </Step>
          <Step>
            <Row n="03">Đọc Offer</Row>
          </Step>
          <Step>
            <Row n="04">Tự trả nếu trong hạn mức</Row>
          </Step>
          <Step>
            <Row n="05">Nhận kết quả, báo lại user</Row>
          </Step>
        </Steps>
      </div>
      <div>
        <Label>Bảo vệ</Label>
        <Spec k="API key" w={220}>
          Chỉ lưu hash SHA-256
        </Spec>
        <Spec k="Signer" w={220}>
          HKDF-SHA256, không lưu key
        </Spec>
        <Spec k="Vượt hạn mức" w={220}>
          Gửi approval link cho user
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
        fontWeight: 700,
        display: "flex",
        gap: 18,
      }}
    >
      <span style={{ color: red }}>!</span>
      {name}
    </div>
    <div style={{ padding: "22px 0", borderTop: `1px solid ${line}`, fontSize: 32, color: bodyInk }}>
      {children}
    </div>
  </>
);

const RiskCheck: Page = () => (
  <Frame n="Phần 2" label="Phòng thủ" title="Risk Check: 5 tín hiệu prompt injection">
    <div style={{ display: "grid", gridTemplateColumns: "520px 1fr", columnGap: 56 }}>
      <Signal name="Payment pressure">Text nhắm assistant để ép trả tiền</Signal>
      <Signal name="Tự tăng giá">Offer sau cao hơn Offer trước</Signal>
      <Signal name="Giá bất thường">Cao hơn 3× median 20 job gần nhất</Signal>
      <Signal name="Refund cao">Từ 50% trong 20 job gần nhất</Signal>
      <Signal name="Agent mới">Dưới 3 job, đòi hơn 1 USDC</Signal>
    </div>
    <Statement style={{ marginTop: 40 }}>
      Có tín hiệu: <Em>chuyển sang user duyệt, không tự trả.</Em>
    </Statement>
  </Frame>
);

// ---------- 13. Kiến trúc ----------

const Architecture: Page = () => (
  <Frame n="Phần 4" label="Kiến trúc" title="Một API, ba worker, ba loại key">
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
      <DiagramLabel x={470} y={446}>
        WORKERS · MỖI WORKER MỘT KEY
      </DiagramLabel>
      <Node x={480} y={480} w={250} h={70} title="Settlement" tone="key" />
      <Node x={745} y={480} w={250} h={70} title="Finance" tone="key" />
      <Node x={1010} y={480} w={210} h={70} title="Job" />
      <Node x={1340} y={40} w={340} h={130} title="Storage" sub="Postgres, Redis, S3" />
      <Node x={1340} y={440} w={340} h={110} title="PayvokeVault" sub="Avalanche" tone="brand" />
    </div>
    <Note style={{ marginTop: 16 }}>Gateway không giữ key. Worker tắt thì key không được nạp.</Note>
  </Frame>
);

// ---------- 14. Vận hành ----------

const Operations: Page = () => (
  <Frame n="Phần 4" label="Vận hành" title="Crash không mất tiền">
    <Spec k="Source of truth" w={360}>
      Postgres: journal, lease, nonce
    </Spec>
    <Spec k="Write-ahead" w={360}>
      Ghi journal trước khi broadcast
    </Spec>
    <Spec k="Finality" w={360}>
      Chỉ chạy sau hold finalized
    </Spec>
    <Spec k="Idempotent" w={360}>
      Cùng invocation ID, cùng receipt
    </Spec>
    <Spec k="Key isolation" w={360}>
      Mỗi worker một key, một gas budget
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
  <Frame n="Phần 3" label="PayvokeVault" title="Ba trạng thái, ba nhánh tiền">
    <div style={{ position: "relative", width: 1680, height: 420 }}>
      <svg width={1680} height={420} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-vault" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-vault)">
          <path d="M360 210H436" />
          <path d="M780 210H1000C1040 210 1040 58 1086 58" />
          <path d="M780 210H1086" />
          <path d="M780 210H1000C1040 210 1040 362 1086 362" />
        </g>
      </svg>
      <Box x={0} y={152} w={360} title="Available" sub="nạp, rút tự do" />
      <Box x={440} y={152} w={340} title="Held" sub="khóa theo quote" tone="brand" />
      <Box x={1090} y={0} w={590} title="Claimable" sub="release sau review window" tone="good" />
      <Box x={1090} y={152} w={590} title="Available" sub="refund 100% khi lỗi hoặc trễ" />
      <Box x={1090} y={304} w={590} title="Available" sub="reclaim sau resolveBy" />
    </div>
    <Note style={{ marginTop: 40, fontSize: 28 }}>
      Invariant: balance ≥ available + held + claimable.
    </Note>
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
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 800 }}>{title}</div>
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
  <Frame n="Phần 3" label="x402 · payvoke-vault" title="Khóa tiền trước, chạy agent sau">
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
      <Lane x={L_VAULT} title="PayvokeVault" sub="Avalanche C-Chain" />
      <Lane x={L_AGENT} title="Provider agent" sub="SSE event feed" />
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={164}>
        Submit quote
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={232} strong>
        402 Payment Required
      </SeqMsg>
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={300}>
        Ký EIP-712, gửi lại
      </SeqMsg>
      <Steps>
        <Step>
          <div>
            <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={368}>
              reserveHold (relayer)
            </SeqMsg>
            <SeqMsg from={L_VAULT} to={L_PAYVOKE} y={436}>
              Hold finalized
            </SeqMsg>
            <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={504} strong>
              202 + receipt
            </SeqMsg>
          </div>
        </Step>
        <Step>
          <div>
            <SeqMsg from={L_PAYVOKE} to={L_AGENT} y={572} strong>
              invocation.ready
            </SeqMsg>
            <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={636}>
              applyDecision (release / refund)
            </SeqMsg>
          </div>
        </Step>
      </Steps>
    </div>
  </Frame>
);

// ---------- 17. Grant ----------

const Grant: Page = () => (
  <Frame n="Phần 3" label="Grant · spend key" title="Grant & spend key: trả tiền không mở ví">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Ví chính ký grant một lần</Label>
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
        <Row n="01">Ký từng quote, không mở ví chính</Row>
        <Row n="02">Vault tự kiểm tra trần on-chain</Row>
        <Row n="03">Vượt trần: Vault từ chối</Row>
        <Row n="04">Revoke: tăng epoch, chữ ký cũ chết</Row>
        <Row n="05">Không rút được vốn gốc</Row>
      </div>
    </div>
  </Frame>
);

// ---------- 18. Contract ----------

const Contract: Page = () => (
  <Frame n="Phần 4" label="Smart contract" title="Vault: immutable, tách quyền">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Roles">Relayer, approver, executor: ba key riêng.</Block>
      <Block title="Pause">Chặn nạp, grant, hold mới; withdraw, reclaim vẫn chạy.</Block>
      <Block title="Immutable">Không proxy, không hàm sửa balance.</Block>
      <Block title="Fee">Trần fee cố định lúc deploy; fee chốt trong quote.</Block>
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
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.035em",
        margin: "44px 0 0",
      }}
    >
      Payvoke
    </h2>
    <p
      style={{
        fontFamily: display,
        fontSize: 52,
        fontWeight: 700,
        lineHeight: 1.25,
        margin: "28px 0 0",
      }}
    >
      Thuê agent theo job.
      <br />
      <Em>Tiền giữ on-chain đến khi giao xong.</Em>
    </p>
    <div style={{ width: 120, height: 4, background: accent, marginTop: 48 }} />
    <p style={{ fontSize: 32, color: bodyInk, margin: "32px 0 0" }}>
      Team Firefly · Cảm ơn Ban Giám Khảo
    </p>
    <Note style={{ marginTop: 12 }}>
      payvoke.xyz · github.com/2giosangmitom/payvoke · Avalanche Fuji testnet
    </Note>
  </Frame>
);
Closing.transition = settle;

// ---------- Trang mở phần ----------

const PartItem = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      padding: "20px 0",
      borderTop: "1px solid rgba(248, 251, 249, 0.25)",
      fontSize: 34,
      lineHeight: 1.3,
    }}
  >
    {children}
  </div>
);

const Divider = ({
  n,
  title,
  children,
}: {
  n: string;
  title: ReactNode;
  children: ReactNode;
}) => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "96px 120px 150px",
        display: "grid",
        gridTemplateColumns: "1fr 680px",
        gridTemplateRows: "1fr",
        gap: 120,
        alignItems: "center",
        background: accent,
        color: ink,
        fontFamily: sans,
      }}
    >
      <div>
        <div
          style={{
            fontFamily: mono,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          Phần {n}
        </div>
        <h2
          style={{
            fontFamily: display,
            fontSize: 96,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.03em",
            margin: "28px 0 0",
          }}
        >
          {title}
        </h2>
      </div>
      <div>{children}</div>
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 52,
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 18,
          borderTop: "1px solid rgba(248, 251, 249, 0.25)",
          fontFamily: mono,
          fontSize: 18,
          letterSpacing: "0.14em",
          opacity: 0.75,
        }}
      >
        <span>PAYVOKE · TEAM FIREFLY</span>
        <span>
          {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
};

const Part1: Page = () => (
  <Divider n="1" title="Vấn đề và cơ hội">
    <PartItem>Builder và Buyer thiếu niềm tin</PartItem>
    <PartItem>MCP, x402, Avalanche đã chín</PartItem>
  </Divider>
);

const Part2: Page = () => (
  <Divider n="2" title="Sản phẩm">
    <PartItem>Ba bên: Builder, Buyer, Vault</PartItem>
    <PartItem>Một job, năm bước</PartItem>
    <PartItem>HTTP/SSE, không cần SDK</PartItem>
    <PartItem>Assistant thuê agent qua MCP</PartItem>
  </Divider>
);

const Part3: Page = () => (
  <Divider n="3" title="Escrow on-chain">
    <PartItem>Quote EIP-712</PartItem>
    <PartItem>x402 + PayvokeVault</PartItem>
    <PartItem>Vòng đời tiền trong Vault</PartItem>
    <PartItem>Grant và spend key</PartItem>
  </Divider>
);

const Part4: Page = () => (
  <Divider n="4" title="Hệ thống">
    <PartItem>API và ba worker</PartItem>
    <PartItem>Crash, finality, idempotent</PartItem>
    <PartItem>Vault immutable</PartItem>
  </Divider>
);

export const meta: SlideMeta = {
  title: "Payvoke",
  createdAt: "2026-10-26T09:14:47.657Z",
};

export default [
  Cover,
  Part1,
  Problem,
  Context,
  Part2,
  WhatIs,
  JobFlow,
  PreSale,
  Execution,
  GenUI,
  Builder,
  Assistant,
  RiskCheck,
  Part3,
  Quote,
  X402,
  Vault,
  Grant,
  Part4,
  Architecture,
  Operations,
  Contract,
  Closing,
] satisfies Page[];

export const notes: (string | undefined)[] = [
  // 1. Cover
  `(~20s)
Chào Ban giám khảo, chúng tôi là Team Firefly.
Payvoke là hạ tầng thanh toán cho AI agent: thuê theo từng job, tiền nằm trong escrow on-chain, chỉ release khi giao xong.
Bài nói gồm 4 phần: vấn đề, sản phẩm, thanh toán on-chain và hệ thống.
Lưu ý: bản demo chạy trên Avalanche Fuji testnet với test USDC.`,

  // 2. Phần 1
  `(~8s)
Phần 1: vì sao thị trường agent cần một lớp thanh toán mới.`,

  // 3. Vấn đề
  `(~40s)
AI agent đã làm được việc, nhưng chưa thu được tiền.
Phía Builder: tự xây payment, refund và xử lý tranh chấp. Mở free trial thì tốn tiền LLM; bắt trả trước thì buyer lạ không dám thử.
Phía Buyer: không có escrow giữ tiền. Agent trễ hoặc sai thì gần như không đòi được. Tệ hơn, khi assistant được quyền chi tiêu, một câu prompt injection có thể dụ nó trả tiền.
Khoảng trống nằm ở giữa: một lớp escrow đáng tin cho cả hai bên.

Nếu bị hỏi "sao không dùng Stripe?":
Phí cố định khoảng 0.30 USD + 2.9% quá cao cho job vài cent. Stripe cũng không hỗ trợ máy tự ký chi tiêu trong hạn mức on-chain.`,

  // 4. Cơ hội
  `(~35s)
Ba mảnh ghép vừa chín.
MCP cho assistant tự gọi tool: Claude Code hay Codex có thể tự tìm và thuê agent.
x402 cho thanh toán ngay trong HTTP: server trả 402, client ký rồi gửi lại.
Avalanche cho finality vài giây với phí dưới 1 cent, hợp với micro-job.
Nhưng x402 hiện chỉ chuyển tiền thẳng. Chưa có escrow, chưa có refund. Payvoke bổ sung đúng lớp đó.`,

  // 5. Phần 2
  `(~8s)
Phần 2: đi theo một job, từ lúc chat đến lúc nhận kết quả.`,

  // 6. Ba bên
  `(~30s)
Payvoke nối ba bên.
Builder chạy agent ở đâu cũng được, chỉ cần đăng ký command, báo giá và stream kết quả.
Buyer là người hoặc AI assistant: tìm agent trên Store, chat free và nhận kết quả.
PayvokeVault là smart contract giữ USDC, release hoặc refund tự động.
Ở giữa là Store, thread, Offer, x402 gateway và MCP.

Nếu bị hỏi "Payvoke có giữ key hay chạy code agent không?":
Không. Agent do builder tự host, buyer giữ key ví. Payvoke chỉ điều phối.`,

  // 7. Vòng đời job
  `(~40s)
Một job có năm bước.
Bước 1, khám phá, chat free: agent trả text, form hoặc các gói.
[→] Bước 2, agent ra Offer: giá USDC, deadline và chính sách refund.
[→] Bước 3, buyer ký Quote EIP-712; USDC vào Vault qua x402.
[→] Bước 4, agent chỉ chạy khi hold đã finalized on-chain.
[→] Bước 5, nghiệm thu: đạt thì release cho Builder; lỗi hoặc trễ thì refund 100%.
Điểm mấu chốt: on-chain chỉ có hai lần tiền di chuyển, bước 3 và bước 5.`,

  // 8. Trước thanh toán
  `(~35s)
Trước khi trả tiền, mọi thứ miễn phí. Agent stream Markdown realtime, có thể trả form, option hoặc confirm.
[→] Buyer gửi file CSV và chọn gói Quick hoặc Deep.
[→] Agent trả Offer card có cấu trúc.
Điểm quan trọng: giá chỉ đọc từ Offer, không parse từ text chat. Vì vậy LLM không thể tự bịa giá.
Ngoài ra còn có trần giá, price floor bù gas và giới hạn số lượt chat để chống spam.`,

  // 9. Thực thi
  `(~35s)
Sau khi hold finalized, run đi qua các state chuẩn: QUEUED, SENT, ACKED, RUNNING, VERIFYING, DELIVERED.
Có nhánh WAITING_BUYER khi agent cần hỏi thêm, và nhánh FAILED hoặc UNKNOWN.
Stream theo AG-UI: text qua TEXT_MESSAGE, mỗi delta tối đa 4.096 ký tự; UI qua event CUSTOM payvoke.openui.
Điều kiện trả tiền không dựa vào stream, mà dựa vào result artifact cuối cùng.`,

  // 10. Generative UI
  `(~30s)
Kết quả không chỉ là text. Agent mô tả UI bằng OpenUI Lang và stream từng patch; Payvoke parse lại cả chương trình sau mỗi patch.
[→] Payvoke render bằng 6 component cố định: Stack, Text, Card, Metric, Table, Chart. Biểu đồ và số liệu hiện ngay trong thread.
Catalog chỉ để hiển thị: không script, không iframe, không link. Nên agent không thể chèn UI độc hại.`,

  // 11. Builder
  `(~30s)
Với builder, tích hợp chỉ là HTTP và SSE.
Mở SSE là agent online. Event nằm trong queue đến khi ACK, nên rớt mạng không mất job.
API key tạo trong Studio với 7 scope. Mọi lệnh ghi đều idempotent, retry không trả tiền hai lần.
File lớn upload qua presigned URL và check SHA-256. Không cần SDK, chạy được với Python, Node, LangChain hay AutoGen.`,

  // 12. MCP
  `(~35s)
Mọi agent trên Store đều dùng được qua MCP, builder không phải viết thêm gì.
Assistant tìm agent, chat kèm context và file, đọc Offer, tự trả nếu trong hạn mức, rồi báo lại user.
Bảo mật: API key chỉ lưu hash SHA-256. Signer suy ra bằng HKDF-SHA256, nên database lộ cũng không ký được. Vượt hạn mức thì hệ thống gửi approval link cho user.

Nếu bị hỏi "spend key lưu ở đâu?":
Trên web, key sinh trong browser và không rời máy. Với assistant, key derive từ secret bằng HKDF.`,

  // 13. Risk check
  `(~35s)
Hạn mức giới hạn số tiền, nhưng prompt injection vẫn có thể dụ assistant tiêu hết. Risk Check chặn trước khi ký, với 5 tín hiệu:
text nhắm assistant để ép trả tiền; Offer sau cao hơn Offer trước; giá cao hơn 3 lần median 20 job gần nhất; từ 50% job gần nhất của agent bị refund; agent mới dưới 3 job mà đòi hơn 1 USDC.
Có tín hiệu là chuyển sang user duyệt, không tự trả.`,

  // 14. Phần 3
  `(~8s)
Phần 3: bên dưới nút Accept, tiền thực sự đi đâu.`,

  // 15. Quote
  `(~30s)
Khi buyer Accept, Payvoke đóng băng giao kèo thành Quote EIP-712: buyer, provider, command và version, hash của input, terms và policy, giá USDC và fee, deliveryDeadline, resolveBy, và invocation key dùng một lần.
Chữ ký debit gắn quote với grant và epoch. Ký xong thì không sửa được điều khoản nào.

Nếu bị hỏi "builder đổi giá sau khi ký thì sao?":
Không ảnh hưởng. Giá đã được hash và chốt trong quote.`,

  // 16. x402
  `(~40s)
Luồng x402 dùng scheme payvoke-vault.
Buyer gửi quote; Payvoke trả 402 Payment Required. Buyer ký EIP-712 bằng spend key và gửi lại.
[→] Settlement worker gọi reserveHold lên Vault. Payvoke đợi transaction finalized rồi mới trả 202 kèm receipt.
[→] Chỉ sau đó agent mới nhận invocation.ready. Khi nghiệm thu xong, Finance worker gọi applyDecision để release hoặc refund.
Khác biệt cốt lõi: tiền không bao giờ đi thẳng cho người bán.`,

  // 17. Vault
  `(~35s)
Trong Vault có ba trạng thái: Available, Held, Claimable.
Buyer nạp vào Available và rút lúc nào cũng được. reserveHold khóa tiền sang Held.
Từ Held có đúng ba nhánh: release sang Claimable cho Builder sau review window; refund 100% về Available nếu lỗi hoặc trễ; reclaim về Available nếu quá resolveBy mà chưa có quyết định.
Invariant: balance luôn lớn hơn hoặc bằng available + held + claimable.`,

  // 18. Grant
  `(~30s)
Để không phải mở ví ký từng job, buyer ký Grant một lần: trần mỗi job, trần mỗi kỳ, tổng hạn mức và ngày hết hạn.
Sau đó spend key ký từng quote; Vault tự kiểm tra trần on-chain.
Revoke chỉ cần tăng epoch, toàn bộ chữ ký cũ mất hiệu lực. Spend key không rút được vốn gốc.`,

  // 19. Phần 4
  `(~8s)
Phần 4: hệ thống và những gì bảo vệ tiền.`,

  // 20. Kiến trúc
  `(~35s)
Kiến trúc tách quyền rõ ràng.
API xử lý chat, AG-UI, agent gateway và x402 gateway. Gateway không giữ key.
Ba worker: Settlement giữ relayer key để reserveHold; Finance giữ approver và executor key để applyDecision; Job worker không giữ key.
Worker tắt thì key của nó không được nạp vào bộ nhớ.`,

  // 21. Vận hành
  `(~30s)
Postgres là source of truth: journal, lease và nonce.
Mọi transaction được ghi journal trước khi broadcast, nên crash ở đâu cũng đối soát được.
Agent chỉ chạy sau finalized. Cùng invocation ID gửi lại luôn nhận cùng receipt. Mỗi worker một key và một gas budget riêng.`,

  // 22. Smart contract
  `(~30s)
Vault có bốn nguyên tắc.
Ba role relayer, approver, executor dùng ba key khác nhau; approver không được trùng executor.
Pause chặn nạp, grant và hold mới; user vẫn withdraw, revoke và reclaim nên không ai giam được tiền.
Không proxy, không hàm sửa balance. Trần fee là immutable, đặt lúc deploy, và fee chốt trong quote.`,

  // 23. Closing
  `(~20s)
Tóm lại: Payvoke cho phép thuê AI agent theo job, tiền nằm on-chain đến khi nghiệm thu xong.
Team Firefly cảm ơn Ban giám khảo. Chúng tôi sẵn sàng nhận câu hỏi.

Nếu bị hỏi nhanh:
Doanh thu: feeBps trên mỗi job, có trần trong contract.
Không giữ tiền trong database: để loại bỏ counterparty risk.
Kết quả giả: có review window và Risk Check.`,
];
