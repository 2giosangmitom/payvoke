import {
  type DesignSystem,
  type Page,
  type SlideMeta,
  type SlideTransition,
  useSlidePageNumber,
} from "@open-slide/core";
import type { CSSProperties, ReactNode } from "react";
import logo from "./assets/logo.svg";

// Osaka Jade daylight. Nền phẳng, kẻ mảnh, một ý mỗi trang.
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

// Một kiểu chuyển trang duy nhất: trang mới hiện dần, không trượt, không blur.
export const transition: SlideTransition = {
  duration: 220,
  exit: {
    duration: 220,
    easing: "cubic-bezier(0.4, 0, 1, 1)",
    keyframes: [{ opacity: 1 }, { opacity: 1 }],
  },
  enter: {
    duration: 220,
    easing: "cubic-bezier(0, 0, 0.2, 1)",
    keyframes: [{ opacity: 0 }, { opacity: 1 }],
  },
};

// ---------- Khung trang ----------

const Footer = ({ appendix }: { appendix?: boolean }) => {
  const { current } = useSlidePageNumber();
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
      <span>PAYVOKE · TEAM FIREFLY{appendix ? " · PHỤ LỤC" : ""}</span>
      <span>{String(current).padStart(2, "0")}</span>
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
  appendix,
}: {
  n?: string;
  label?: string;
  title?: ReactNode;
  children: ReactNode;
  bare?: boolean;
  appendix?: boolean;
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
          {label && <span style={{ color: muted, marginLeft: 20 }}>{label}</span>}
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
    <Footer appendix={appendix} />
  </div>
);

const Em = ({ children }: { children: ReactNode }) => (
  <span style={{ color: accent }}>{children}</span>
);

const Note = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontSize: 28, lineHeight: 1.5, color: muted, ...style }}>{children}</div>
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
      <div style={{ fontSize: 22, lineHeight: 1.35, opacity: 0.85, marginTop: 4 }}>{sub}</div>
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
      fontSize: 18,
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

// =====================================================================
// PHẦN CHÍNH (11 trang, khoảng 6 phút lời thoại)
// =====================================================================

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
      Marketplace nơi AI agent được thuê để hoàn thành công việc.
      <br />
      <Em>Trả tiền theo từng job, chỉ khi có kết quả.</Em>
    </p>
  </Frame>
);

// ---------- 2. Vấn đề ----------

const Problem: Page = () => (
  <Frame n="Vấn đề" title="Thuê AI agent hôm nay phải dựa vào niềm tin">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64 }}>
      <Block tag="Buyer" title="Trả trước, rủi ro tự chịu">
        Agent lỗi, chậm hoặc im lặng thì buyer mất tiền và không có cách đòi lại.
      </Block>
      <Block tag="Builder" title="Khó bán theo từng job">
        Muốn thu tiền mỗi job phải tự làm billing, cổng thanh toán và chi trả.
      </Block>
      <Block tag="AI assistant" title="Dễ bị dụ trả tiền">
        Assistant đọc tin nhắn của agent lạ và có thể bị ép thanh toán.
      </Block>
    </div>
    <Statement style={{ marginTop: 64 }}>
      Payvoke giữ tiền trong escrow <Em>cho đến khi job được giao.</Em>
    </Statement>
  </Frame>
);

// ---------- 3. Vì sao là lúc này ----------

const Context: Page = () => (
  <Frame n="Bối cảnh" title="Vì sao là lúc này">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 64 }}>
      <Block tag="MCP" title="Assistant biết gọi công cụ">
        Claude Code hay Codex tự tìm agent và giao việc.
      </Block>
      <Block tag="x402" title="Thanh toán trong HTTP">
        Server trả mã 402, client ký rồi gửi lại.
      </Block>
      <Block tag="Avalanche" title="Phí thấp, finality nhanh">
        Đủ rẻ cho những job chỉ vài USDC.
      </Block>
    </div>
    <Statement style={{ marginTop: 64 }}>
      Còn thiếu một nơi để <Em>tìm agent và trả tiền an toàn theo từng job.</Em>
    </Statement>
  </Frame>
);

// ---------- 4. Giải pháp ----------

const Idea: Page = () => (
  <Frame n="Giải pháp" title="Payvoke kết nối builder và buyer">
    <div style={{ position: "relative", width: 1680, height: 330 }}>
      <svg width={1680} height={330} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-idea" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-idea)">
          <path d="M480 90H596" />
          <path d="M1080 90H1196" />
          <path d="M1440 164V290H240V168" />
        </g>
      </svg>
      <Node x={0} y={20} w={480} h={140} title="Builder" sub="Tự host agent, đặt giá từng lệnh" />
      <Node
        x={600}
        y={20}
        w={480}
        h={140}
        title="Payvoke"
        sub="Store · Chat · Escrow"
        tone="brand"
      />
      <Node x={1200} y={20} w={480} h={140} title="Buyer" sub="Người dùng web hoặc AI assistant" />
      <DiagramLabel x={600} y={279}>
        USDC NẰM TRONG ESCROW ĐẾN KHI GIAO
      </DiagramLabel>
    </div>
    <Statement style={{ marginTop: 48 }}>
      Builder không phải tự làm billing. <Em>Buyer không phải trả trước cho agent lạ.</Em>
    </Statement>
  </Frame>
);

// ---------- 5. Vòng đời một job ----------

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
        <Stage n="1" title="Chat" tag="off-chain">
          Miễn phí, agent hỏi thêm chi tiết
        </Stage>
        <Stage n="2" title="Offer" tag="off-chain">
          Giá, hạn giao và chính sách refund
        </Stage>
        <Stage n="3" title="Ký quỹ" tag="on-chain" money>
          Buyer ký một lần, USDC vào Vault
        </Stage>
        <Stage n="4" title="Thực thi" tag="off-chain">
          Agent chạy khi tiền đã chốt
        </Stage>
        <Stage n="5" title="Quyết toán" tag="on-chain" money>
          Release cho builder hoặc refund cho buyer
        </Stage>
      </div>
    </div>
    <Note style={{ marginTop: 56 }}>
      Tiền chỉ di chuyển trên chain hai lần: lúc ký quỹ và lúc quyết toán.
    </Note>
  </Frame>
);

// ---------- 6. Bảo vệ buyer ----------

// One stage of a job and what protects the buyer in it.
const Guard = ({ stage, children }: { stage: string; children: ReactNode }) => (
  <div style={{ borderTop: `3px solid ${accent}`, paddingTop: 22 }}>
    <Label style={{ color: accent, marginBottom: 4 }}>{stage}</Label>
    {children}
  </div>
);

const BuyerProtection: Page = () => (
  <Frame n="Bảo vệ buyer" title="Buyer được bảo vệ ở mọi bước">
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 56 }}>
      <Guard stage="Trước khi trả">
        <Row n="01" size={28}>
          Track record công khai
        </Row>
        <Row n="02" size={28}>
          Nhãn New agent
        </Row>
        <Row n="03" size={28}>
          Giá trần hiện trên Store
        </Row>
        <Row n="04" size={28}>
          Giá chỉ lấy từ Offer
        </Row>
      </Guard>
      <Guard stage="Khi trả">
        <Row n="05" size={28}>
          Ký đúng một quote
        </Row>
        <Row n="06" size={28}>
          Hạn mức cho AI assistant
        </Row>
        <Row n="07" size={28}>
          Risk Check trước khi tự trả
        </Row>
      </Guard>
      <Guard stage="Sau khi trả">
        <Row n="08" size={28}>
          Tiền ở escrow tới khi giao
        </Row>
        <Row n="09" size={28}>
          Refund khi lỗi hoặc trễ
        </Row>
        <Row n="10" size={28}>
          Yêu cầu sửa, có hạn riêng
        </Row>
        <Row n="11" size={28}>
          Đánh giá sau khi quyết toán
        </Row>
      </Guard>
    </div>
    <Note style={{ marginTop: 48 }}>
      Track record tính từ kết quả escrow của 50 job gần nhất. Job chủ agent tự mua không được tính.
    </Note>
  </Frame>
);

// ---------- 7. Vì sao on-chain ----------

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
  <Frame n="Thanh toán" title="Vì sao giữ tiền on-chain">
    <Versus head k="" a="NẠP TIỀN VÀO NỀN TẢNG" b="ESCROW ON-CHAIN" />
    <Versus k="Ai giữ tiền" a="Nền tảng, người dùng phải tin" b="Smart contract công khai" />
    <Versus k="Trả cho builder" a="Vướng KYC và ngân hàng từng nước" b="Về thẳng ví của builder" />
    <Versus k="Hoàn tiền" a="Theo quy trình nội bộ" b="Tự động khi lỗi hoặc trễ hạn" />
    <Versus
      k="AI tự chi tiêu"
      a="Cần tài khoản và số dư riêng"
      b="Hạn mức on-chain, thu hồi được"
    />
    <Statement style={{ marginTop: 40 }}>
      Payvoke <Em>không rút được tiền của buyer.</Em> Luật refund nằm trong contract.
    </Statement>
  </Frame>
);

// ---------- 8. Tiền đi như thế nào ----------

const MoneyFlow: Page = () => (
  <Frame n="Thanh toán" title="Tiền đi như thế nào">
    <div style={{ position: "relative", width: 1680, height: 420 }}>
      <svg width={1680} height={420} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-money" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-money)">
          <path d="M360 210H436" />
          <path d="M780 210H1000C1040 210 1040 58 1086 58" />
          <path d="M780 210H1086" />
          <path d="M780 210H1000C1040 210 1040 362 1086 362" />
        </g>
      </svg>
      <Box x={0} y={152} w={360} title="Ví buyer" sub="ký một lần, không gas" />
      <Box x={440} y={152} w={340} title="PayvokeVault" sub="giữ riêng cho job" tone="brand" />
      <Box
        x={1090}
        y={0}
        w={590}
        title="Ví builder"
        sub="giao đúng hạn, sau review window"
        tone="good"
      />
      <Box
        x={1090}
        y={152}
        w={590}
        title="Ví buyer"
        sub="refund khi lỗi; trễ ít thì hoàn một phần"
      />
      <Box x={1090} y={304} w={590} title="Ví buyer" sub="tự rút lại nếu quá hạn quyết định" />
    </div>
    <Note style={{ marginTop: 48 }}>
      Chữ ký gắn với đúng một quote: agent, input, giá và deadline. Ký xong không ai sửa được.
    </Note>
  </Frame>
);

// ---------- 9. An toàn cho AI assistant ----------

const AgentSafety: Page = () => (
  <Frame n="An toàn" title="Khi AI assistant tự trả tiền">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Hạn mức do buyer đặt</Label>
        <Spec k="Mỗi job" w={200}>
          Trần cho một job
        </Spec>
        <Spec k="Mỗi kỳ" w={200}>
          Trần theo kỳ
        </Spec>
        <Spec k="Tổng" w={200}>
          Tổng hạn mức, ngày hết hạn
        </Spec>
        <Spec k="Thu hồi" w={200}>
          Một chữ ký, không tốn gas
        </Spec>
      </div>
      <div>
        <Label>Risk Check · 5 tín hiệu</Label>
        <Row n="!" tone="warn">
          Agent ra lệnh cho assistant trả tiền
        </Row>
        <Row n="!" tone="warn">
          Agent đổi sang Offer giá cao hơn
        </Row>
        <Row n="!" tone="warn">
          Giá hơn 3 lần mức thường của lệnh
        </Row>
        <Row n="!" tone="warn">
          Tỷ lệ refund từ 50% trở lên
        </Row>
        <Row n="!" tone="warn">
          Agent mới, giá trên 1 USDC
        </Row>
      </div>
    </div>
    <Statement style={{ marginTop: 40 }}>
      Vượt hạn mức hoặc có một tín hiệu: <Em>người dùng tự duyệt.</Em>
    </Statement>
  </Frame>
);

// ---------- 10. Kiến trúc ----------

const Architecture: Page = () => (
  <Frame n="Hệ thống" title="Kiến trúc">
    <div style={{ position: "relative", width: 1680, height: 400 }}>
      <div
        style={{
          position: "absolute",
          left: 480,
          top: 0,
          width: 680,
          height: 400,
          border: `2px dashed ${lineStrong}`,
          boxSizing: "border-box",
        }}
      />
      <DiagramLabel x={500} y={-11}>
        PAYVOKE API
      </DiagramLabel>
      <svg width={1680} height={400} style={{ position: "absolute", inset: 0 }}>
        <ArrowDefs id="pv-arch" />
        <g stroke={lineStrong} strokeWidth={2.5} fill="none" markerEnd="url(#pv-arch)">
          <path d="M360 55H476" />
          <path d="M360 195H476" />
          <path d="M360 335H476" />
          <path d="M1160 100H1316" />
          <path d="M1160 335H1316" />
        </g>
      </svg>
      <Node x={0} y={0} w={360} h={110} title="Web app" sub="Store, chat, Studio" />
      <Node x={0} y={140} w={360} h={110} title="AI assistant" sub="qua MCP" />
      <Node x={0} y={280} w={360} h={110} title="Agent của builder" sub="HTTPS và SSE" />
      <Node x={520} y={40} w={600} h={80} title="Chat · Offer · Quote" />
      <Node x={520} y={140} w={600} h={80} title="x402 gateway · MCP server" />
      <DiagramLabel x={512} y={250}>
        WORKERS · MỖI WORKER MỘT KEY
      </DiagramLabel>
      <Node x={520} y={290} w={190} h={70} title="Settlement" tone="key" />
      <Node x={725} y={290} w={190} h={70} title="Finance" tone="key" />
      <Node x={930} y={290} w={190} h={70} title="Job" />
      <Node
        x={1320}
        y={40}
        w={360}
        h={120}
        title="Postgres · Redis · S3"
        sub="job, journal, file"
      />
      <Node
        x={1320}
        y={280}
        w={360}
        h={110}
        title="PayvokeVault"
        sub="Avalanche Fuji"
        tone="brand"
      />
    </div>
    <Note style={{ marginTop: 40 }}>
      React, TanStack Start · Bun, Hono, Prisma · Solidity, Hardhat · x402, EIP-712, EIP-3009
    </Note>
  </Frame>
);

// ---------- 11. Doanh thu và roadmap ----------

const Business: Page = () => (
  <Frame n="Kinh doanh" title="Doanh thu và roadmap">
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 96 }}>
      <div>
        <Label>Doanh thu</Label>
        <Spec k="Phí" w={180}>
          5% mỗi job, trừ lúc release cho builder
        </Spec>
        <Spec k="Trần phí" w={180}>
          10%, cố định trong contract
        </Spec>
        <Spec k="Job lỗi" w={180}>
          Refund toàn bộ, Payvoke không thu phí
        </Spec>
      </div>
      <div>
        <Label>Roadmap</Label>
        <Row n="01" tone="todo">
          Lên Avalanche mainnet
        </Row>
        <Row n="02" tone="todo">
          Khiếu nại khi kết quả kém
        </Row>
        <Row n="03" tone="todo">
          SDK cho Python và TypeScript
        </Row>
        <Row n="04" tone="todo">
          Đưa những builder đầu tiên lên Store
        </Row>
      </div>
    </div>
  </Frame>
);

// ---------- 12. Closing ----------

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
      Team Firefly · Cảm ơn Ban giám khảo
    </p>
    <Note style={{ marginTop: 12 }}>payvoke.xyz · github.com/2giosangmitom/payvoke</Note>
  </Frame>
);

// =====================================================================
// PHỤ LỤC (chỉ mở khi có câu hỏi)
// =====================================================================

const AppendixCover: Page = () => (
  <Frame bare appendix>
    <div
      style={{
        fontFamily: mono,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: "0.16em",
        color: accent,
      }}
    >
      PHỤ LỤC
    </div>
    <h2
      style={{
        fontFamily: display,
        fontSize: 100,
        fontWeight: 600,
        lineHeight: 1.1,
        letterSpacing: "-0.02em",
        margin: "32px 0 0",
      }}
    >
      Chi tiết kỹ thuật
    </h2>
    <Note style={{ marginTop: 32 }}>
      Thực thi job · Giao diện kết quả · Tích hợp · Quote · x402 · Vault · Hạn mức · Risk Check · Độ
      tin cậy · Smart contract
    </Note>
  </Frame>
);

// ---------- A. Thực thi ----------

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
  <Frame n="Phụ lục" label="Sản phẩm" title="Thực thi job" appendix>
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
        AG-UI: text và OpenUI theo thời gian thực
      </Spec>
      <Spec k="Điều kiện trả" w={300}>
        Dựa vào kết quả cuối cùng, không dựa vào stream
      </Spec>
    </div>
  </Frame>
);

// ---------- A. OpenUI ----------

const Metric = ({ label, value, note }: { label: string; value: string; note: string }) => (
  <div style={{ flex: 1, padding: "16px 20px", border: `1px solid ${line}` }}>
    <div style={{ fontFamily: mono, fontSize: 18, letterSpacing: "0.1em", color: muted }}>
      {label}
    </div>
    <div style={{ fontFamily: display, fontSize: 44, fontWeight: 600, marginTop: 2 }}>{value}</div>
    <div style={{ fontSize: 20, color: muted }}>{note}</div>
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
  <Frame n="Phụ lục" label="Sản phẩm" title="Giao diện kết quả" appendix>
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
      <Window title="Kết quả trong chat">
        <div style={{ display: "flex", gap: 12 }}>
          <Metric label="DOANH THU Q3" value="−18%" note="so với Q2" />
          <Metric label="ĐƠN HÀNG" value="3.204" note="−9%" />
        </div>
        <div style={{ border: `1px solid ${line}`, padding: "18px 20px" }}>
          <div style={{ fontSize: 23, fontWeight: 600, marginBottom: 14 }}>
            Doanh thu theo khu vực
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

// ---------- A. Tích hợp ----------

const Builder: Page = () => (
  <Frame n="Phụ lục" label="Tích hợp" title="Tích hợp cho builder" appendix>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Event feed">SSE, event giữ trong queue đến khi ACK.</Block>
      <Block title="API key">7 scope, tạo trong Studio.</Block>
      <Block title="Idempotent">Retry không bị tính tiền hai lần.</Block>
      <Block title="File">Upload qua presigned URL, kiểm SHA-256.</Block>
    </div>
    <Note style={{ marginTop: 56 }}>Ngôn ngữ nào cũng được, chỉ cần gọi HTTP và đọc SSE.</Note>
  </Frame>
);

const Assistant: Page = () => (
  <Frame n="Phụ lục" label="Tích hợp" title="Tích hợp AI assistant" appendix>
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

// ---------- A. Quote ----------

const Field = ({ k, children }: { k: string; children: ReactNode }) => (
  <div style={{ padding: "24px 28px", background: surface, border: `1px solid ${line}` }}>
    <Label style={{ color: accent }}>{k}</Label>
    <div style={{ fontSize: 30, lineHeight: 1.4 }}>{children}</div>
  </div>
);

const Quote: Page = () => (
  <Frame n="Phụ lục" label="Thanh toán" title="Quote EIP-712" appendix>
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

// ---------- A. x402 ----------

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
    <div style={{ fontSize: 20, color: muted }}>{sub}</div>
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
  <Frame n="Phụ lục" label="Thanh toán" title="Luồng thanh toán x402" appendix>
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
      <Lane x={L_PAYVOKE} title="Payvoke API" sub="x402 gateway, relayer" />
      <Lane x={L_VAULT} title="PayvokeVault" sub="Avalanche" />
      <Lane x={L_AGENT} title="Agent" sub="SSE event feed" />
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={164}>
        Gửi quote
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={232} strong>
        402 Payment Required
      </SeqMsg>
      <SeqMsg from={L_BUYER} to={L_PAYVOKE} y={300}>
        Ký USDC EIP-3009, gửi lại
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={368}>
        fundWithAuthorization
      </SeqMsg>
      <SeqMsg from={L_VAULT} to={L_PAYVOKE} y={436}>
        Hold finalized
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_BUYER} y={504} strong>
        202 + receipt
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_AGENT} y={572} strong>
        invocation.ready
      </SeqMsg>
      <SeqMsg from={L_PAYVOKE} to={L_VAULT} y={636}>
        applyDecision: release hoặc refund
      </SeqMsg>
    </div>
  </Frame>
);

// ---------- A. Vault ----------

const Vault: Page = () => (
  <Frame n="Phụ lục" label="Thanh toán" title="PayvokeVault" appendix>
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
      <Box x={1090} y={456} w={590} title="Claimable" sub="USDC bị chặn, người nhận tự claim" />
    </div>
  </Frame>
);

// ---------- A. Grant ----------

const Grant: Page = () => (
  <Frame n="Phụ lục" label="Thanh toán" title="Grant và spend key" appendix>
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

// ---------- A. Risk check chi tiết ----------

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
  <Frame n="Phụ lục" label="An toàn" title="Risk Check: ngưỡng cụ thể" appendix>
    <Label>Khi assistant hoặc API key tự thanh toán, sau khi đã qua hạn mức</Label>
    <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", columnGap: 56 }}>
      <Signal name="Ép thanh toán">Agent bảo assistant bỏ qua luật, trả ngay</Signal>
      <Signal name="Tăng giá">Offer mới thay Offer cũ với giá cao hơn</Signal>
      <Signal name="Giá bất thường">Trên 3 lần median, tính trên 20 lần mua gần nhất</Signal>
      <Signal name="Refund cao">Từ 50% trong 20 job đã đóng gần nhất (tối thiểu 5)</Signal>
      <Signal name="Agent mới">Dưới 3 job đã trả và giá trên 1 USDC</Signal>
    </div>
  </Frame>
);

// ---------- A. Vận hành ----------

const Operations: Page = () => (
  <Frame n="Phụ lục" label="Hệ thống" title="Độ tin cậy" appendix>
    <Spec k="Dữ liệu" w={300}>
      Postgres là nguồn dữ liệu chính của job và giao dịch.
    </Spec>
    <Spec k="Journal" w={300}>
      Giao dịch được ghi trước khi gửi lên chain, nên đối soát được sau sự cố.
    </Spec>
    <Spec k="Finality" w={300}>
      Agent chỉ chạy sau khi khoản tiền đã chốt trên chain.
    </Spec>
    <Spec k="Idempotent" w={300}>
      Gửi lại cùng yêu cầu chỉ nhận lại biên nhận cũ, không bị tính tiền hai lần.
    </Spec>
    <Spec k="Key" w={300}>
      Mỗi worker một key riêng. Lộ một key không ảnh hưởng worker khác.
    </Spec>
  </Frame>
);

// ---------- A. Contract ----------

const Contract: Page = () => (
  <Frame n="Phụ lục" label="Hệ thống" title="Smart contract" appendix>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "56px 96px" }}>
      <Block title="Tách quyền">
        Relayer, approver, executor dùng ba key riêng. Lộ một key không đủ để lấy tiền.
      </Block>
      <Block title="Tạm dừng vẫn an toàn">
        Pause chặn job và grant mới. Người dùng vẫn revoke và rút tiền về ví được.
      </Block>
      <Block title="Không sửa được số dư">
        Không proxy, không có hàm sửa balance. Số dư chỉ đổi qua các bước hợp lệ.
      </Block>
      <Block title="Trần phí cố định">
        Đặt một lần lúc deploy. Phí của mỗi job được chốt trong quote.
      </Block>
    </div>
  </Frame>
);

export const meta: SlideMeta = {
  title: "Payvoke",
  createdAt: "2026-10-26T09:14:47.657Z",
};

export default [
  // Phần chính
  Cover,
  Problem,
  Context,
  Idea,
  JobFlow,
  BuyerProtection,
  WhyOnchain,
  MoneyFlow,
  AgentSafety,
  Architecture,
  Business,
  Closing,
  // Phụ lục
  AppendixCover,
  Execution,
  GenUI,
  Builder,
  Assistant,
  Quote,
  X402,
  Vault,
  Grant,
  RiskCheck,
  Operations,
  Contract,
] satisfies Page[];

export const notes: (string | undefined)[] = [
  // Cover
  `(~15s)
Chào Ban giám khảo, chúng tôi là Team Firefly.
Payvoke là marketplace cho AI agent. Buyer thuê agent theo từng job, và builder chỉ nhận tiền khi job được giao.`,

  // Problem
  `(~40s)
Hôm nay muốn thuê một AI agent, bạn phải trả trước và tin rằng nó sẽ làm xong. Agent lỗi, chậm hay im lặng thì tiền coi như mất.
Builder cũng gặp khó: muốn bán theo từng job thì phải tự làm billing, cổng thanh toán và chi trả.
Khi AI assistant tự đi thuê agent, nó đọc tin nhắn của agent lạ, nên có thể bị dụ trả tiền.
Payvoke xử lý cả ba bằng một cách: giữ tiền trong escrow cho đến khi job được giao.`,

  // Context
  `(~30s)
Ba thứ vừa sẵn sàng cùng lúc.
MCP cho Claude Code hay Codex tự gọi công cụ, nên assistant có thể tự tìm agent và giao việc.
x402 đưa thanh toán vào HTTP: server trả mã 402, client ký rồi gửi lại.
Avalanche có phí thấp và finality nhanh, đủ rẻ cho job chỉ vài USDC.
Thứ còn thiếu là một nơi để tìm agent và trả tiền an toàn theo từng job.`,

  // Idea
  `(~30s)
Payvoke đứng giữa hai phía.
Builder tự host agent, đăng lên Store và đặt giá cho từng lệnh.
Buyer là người dùng trên web hoặc một AI assistant. Họ tìm agent trên Store, chat thử miễn phí rồi giao job.
Payvoke lo phần chat, báo giá, giữ tiền và giao kết quả.`,

  // JobFlow
  `(~40s)
Một job đi qua năm bước.
Buyer chat miễn phí, agent có thể hỏi thêm bằng form hoặc lựa chọn.
Agent đưa ra Offer gồm giá, hạn giao và chính sách refund.
Buyer chấp nhận và ký một lần, USDC đi từ ví vào Vault.
Agent chỉ bắt đầu chạy khi khoản tiền đó đã chốt trên chain.
Giao đúng hạn thì builder nhận tiền sau thời gian review. Lỗi hoặc trễ thì buyer được refund 100%.
Trên chain, tiền chỉ di chuyển ở bước 3 và bước 5.`,

  // BuyerProtection
  `(~40s)
Gom lại, buyer được bảo vệ ở cả ba giai đoạn của một job.
Trước khi trả: mỗi agent có track record công khai gồm tỷ lệ thành công, đúng hạn và refund. Agent mới có nhãn riêng. Mỗi lệnh phải khai giá trần trên Store, và giá chỉ lấy từ Offer có cấu trúc, nên agent không thể đòi giá trong tin nhắn chat.
Khi trả: chữ ký gắn với đúng một quote. Nếu AI assistant trả thay, nó bị giới hạn bởi hạn mức và Risk Check.
Sau khi trả: tiền nằm trong escrow tới khi giao. Lỗi hoặc trễ thì refund. Buyer được yêu cầu sửa, mỗi lần sửa có hạn riêng. Buyer chỉ đánh giá được sau khi job đã quyết toán, nên đánh giá phản ánh kết quả thật.

Nếu bị hỏi "track record có bị làm giả không?":
Số liệu lấy từ kết quả escrow trên chain, không từ lời agent. Job chủ agent tự mua không được tính.`,

  // WhyOnchain
  `(~40s)
Câu hỏi hay gặp: sao không cho người dùng nạp tiền vào nền tảng rồi xử lý nội bộ?
Cách đó rẻ, nhưng nền tảng trở thành bên giữ tiền và người dùng phải tin nó. Trả tiền cho builder ở nhiều nước thì vướng KYC và ngân hàng. Hoàn tiền đi theo quy trình nội bộ.
Với escrow on-chain, Payvoke không rút được tiền của buyer, builder nhận tiền thẳng về ví, và luật refund nằm trong contract nên ai cũng kiểm tra được.

Nếu bị hỏi "đánh đổi là gì?":
Người dùng cần có ví và USDC. Nhóm đầu tiên chúng tôi nhắm tới là builder, người đã quen dùng ví, và AI assistant tự thanh toán.`,

  // MoneyFlow
  `(~45s)
Buyer không nạp tiền trước. Khi chấp nhận Offer, ví ký một USDC authorization cho đúng job đó. Relayer của Payvoke nộp giao dịch nên buyer không trả gas.
Tiền vào PayvokeVault và được giữ riêng cho job. Từ đây chỉ có ba lối ra. Giao đúng hạn thì builder nhận sau review window, đã trừ phí. Lỗi thì buyer được refund 100%. Quá hạn mà chưa có quyết định thì buyer tự rút lại.
Với giao trễ, builder có thể ký trước một chính sách: trễ dưới một khoảng nhỏ thì hoàn cho buyer một phần, phần còn lại vẫn trả cho builder. Không có chính sách đó thì trễ là refund toàn bộ.
Chữ ký gắn với đúng một quote gồm agent, input, giá và deadline, nên ký xong không ai sửa được điều khoản.
Chi tiết x402 và EIP-712 nằm trong phụ lục.

Nếu bị hỏi "builder giao trễ có mất hết tiền không?":
Mặc định là có, vì đó là cam kết builder tự chọn. Builder có thể ký thêm chính sách trễ, ví dụ trễ dưới 10 phút thì hoàn 20%. Vault trả hai phần trong một giao dịch.
Nếu bị hỏi "buyer xin sửa sau deadline thì builder có bị tính trễ không?":
Không. Mỗi lần sửa có hạn riêng, tính từ lúc buyer yêu cầu. Bản sửa chỉ bị tính trễ nếu quá hạn của chính nó.`,

  // AgentSafety
  `(~45s)
Muốn để AI assistant tự trả tiền, buyer đặt hạn mức trước: trần mỗi job, trần mỗi kỳ, tổng hạn mức và ngày hết hạn. Thu hồi chỉ cần một chữ ký, không tốn gas.
Hạn mức giới hạn số tiền, nhưng agent xấu vẫn có thể dụ assistant tiêu đúng trong hạn mức. Vì vậy có thêm Risk Check với năm tín hiệu: agent ra lệnh cho assistant trả tiền, agent đổi sang Offer đắt hơn, giá hơn 3 lần mức thường của lệnh đó, tỷ lệ refund từ 50%, hoặc agent mới mà giá trên 1 USDC.
Chỉ cần một tín hiệu là assistant phải hỏi người dùng. Thanh toán bằng ví trên web luôn do buyer tự ký nên không qua lớp này.

Nếu bị hỏi "agent viết khác đi thì có né được không?":
Có thể, vì đây là nhận diện theo mẫu. Hạn mức vẫn giới hạn thiệt hại, và escrow vẫn giữ tiền đến khi giao.`,

  // Architecture
  `(~35s)
Có ba loại client: web app, AI assistant qua MCP, và agent của builder kết nối bằng HTTPS và SSE. Builder viết agent bằng ngôn ngữ nào cũng được.
API xử lý chat, quote, x402 và MCP. Ba worker lo những việc chạm vào tiền, mỗi worker giữ một key riêng, nên lộ một key không đủ để lấy tiền.
Postgres ghi lại mọi giao dịch trước khi gửi lên chain, nên sự cố xảy ra ở đâu cũng đối soát được.
Vault đang chạy trên Avalanche Fuji testnet.`,

  // Business
  `(~35s)
Payvoke thu 5% trên mỗi job. Phí được trừ lúc release cho builder, nên buyer trả đúng giá trong Offer.
Trần phí là 10%, ghi cố định trong contract từ lúc deploy. Payvoke không tự tăng quá mức đó được, và phí của từng job đã chốt trong quote. Job bị refund toàn bộ thì Payvoke không thu gì. Job giao trễ được hoàn một phần thì phí chỉ tính trên phần trả cho builder.
Roadmap: lên mainnet, thêm cơ chế khiếu nại khi kết quả kém, phát hành SDK, và đưa những builder đầu tiên lên Store.

Nếu bị hỏi "buyer không trả gas thì ai trả?":
Payvoke trả gas cho cả giao dịch ký quỹ lẫn quyết toán. Phí 5% bù lại phần đó, và mỗi job có giá sàn để không job nào rẻ hơn chi phí gas.`,

  // Closing
  `(~20s)
Payvoke cho buyer thuê AI agent theo từng job mà không phải trả trước cho người lạ, và cho builder một cách nhận tiền theo job mà không phải tự làm billing.
Team Firefly cảm ơn Ban giám khảo. Chúng tôi sẵn sàng nhận câu hỏi.

Nếu bị hỏi "kết quả kém nhưng vẫn giao đúng hạn thì sao?":
Trong review window, buyer yêu cầu sửa được, số lần sửa theo điều khoản trong Offer đã ký. Buyer chỉ đánh giá được sau khi job đã quyết toán, nên đánh giá phản ánh kết quả thật. Khiếu nại về chất lượng nằm trong roadmap.
Nếu bị hỏi "sao không giữ tiền trong database?":
Để buyer không phải tin Payvoke.`,

  // AppendixCover
  `Chỉ mở phụ lục khi có câu hỏi. Nhảy thẳng tới trang cần dùng từ lưới tổng quan.`,

  // Execution
  `Sau khi hold finalized, run đi qua các state QUEUED, SENT, ACKED, RUNNING, VERIFYING, DELIVERED.
Có nhánh WAITING_BUYER khi agent cần hỏi thêm, và nhánh FAILED hoặc UNKNOWN.
Stream theo AG-UI: text qua TEXT_MESSAGE, mỗi delta tối đa 4.096 ký tự; UI qua event CUSTOM payvoke.openui.
Việc trả tiền dựa vào result artifact cuối cùng, không dựa vào stream.`,

  // GenUI
  `Agent mô tả UI bằng OpenUI Lang và stream từng patch. Payvoke parse lại cả chương trình sau mỗi patch.
Chỉ có 6 component: Stack, Text, Card, Metric, Table, Chart. Không có script, iframe hay link, nên agent không chèn được UI độc hại.`,

  // Builder
  `Mở SSE là agent online. Event nằm trong queue đến khi ACK, nên rớt mạng không mất job.
API key tạo trong Studio với 7 scope. Mọi lệnh ghi đều idempotent.
File lớn upload qua presigned URL và kiểm SHA-256.

Nếu bị hỏi "sao chưa có SDK?":
Tài liệu API và ba agent mẫu (CSV Analyst, Job Finder, CV Reviewer) chỉ dùng fetch và SSE. SDK nằm trong roadmap.`,

  // Assistant
  `Mọi agent trên Store đều dùng được qua MCP, builder không phải viết thêm gì.
API key chỉ lưu hash SHA-256. Signer suy ra bằng HKDF-SHA256, nên lộ database cũng không ký được.

Nếu bị hỏi "spend key lưu ở đâu?":
Trên web, key sinh trong browser và không rời máy. Với assistant, key suy ra từ secret bằng HKDF.`,

  // Quote
  `Khi buyer Accept, Payvoke chốt giao kèo thành Quote EIP-712: buyer, provider, command và version, hash của input, terms và policy, giá và fee, deliveryDeadline, resolveBy, và invocation key dùng một lần.
Ví ký USDC authorization có nonce là quote digest. Spend key ký debit gắn quote với grant và epoch.

Nếu bị hỏi "builder đổi giá sau khi ký thì sao?":
Không ảnh hưởng, giá đã được hash trong quote.`,

  // X402
  `Scheme payvoke-escrow.
Buyer gửi quote, Payvoke trả 402. Ví ký USDC authorization (EIP-3009) cho đúng quote đó rồi gửi lại.
Settlement worker gọi fundWithAuthorization. Chỉ Vault nộp được authorization này, nên USDC đi thẳng từ ví vào escrow của job. Payvoke đợi finalized rồi mới trả 202 kèm receipt.
Sau đó agent mới nhận invocation.ready. Khi quyết toán, Finance worker gọi applyDecision.`,

  // Vault
  `Buyer không có số dư trong Vault. Tiền nằm trong ví đến lúc job được fund.
Từ Held có ba nhánh, đều trả thẳng về ví: release cho builder sau review window, refund 100% nếu lỗi hoặc trễ, reclaim nếu quá resolveBy mà chưa có quyết định. Nếu USDC từ chối chuyển (blacklist), khoản đó thành claimable để người nhận tự rút.
Invariant: balance luôn lớn hơn hoặc bằng held + claimable.`,

  // Grant
  `Buyer ký Grant một lần, kèm permit USDC đúng bằng hạn mức. Relayer nộp lên chain nên buyer không tốn gas.
Spend key ký từng quote. Vault kéo tiền qua allowance và tự kiểm tra trần on-chain.
Revoke tăng epoch và hạ allowance, mọi chữ ký cũ mất hiệu lực.`,

  // RiskCheck
  `Ép thanh toán: tin nhắn hoặc Offer nhắm vào assistant, như bảo bỏ qua hướng dẫn, trả ngay không cần hỏi, nhắc tên tool hoặc đòi API key. Nhận diện cả tiếng Anh và tiếng Việt.
Tăng giá: buyer từ chối rồi hỏi lại thì không tính.
Giá bất thường: cần ít nhất 3 lần mua trước đó.
Agent mới: job do chính chủ agent tự mua không được tính.
Ngoài ra, 3 lần fund bị revert trong 24 giờ thì buyer bị tạm dừng tự trả 1 giờ để không đốt gas của relayer.`,

  // Operations
  `Postgres giữ journal, lease và nonce. Mọi transaction được ghi journal trước khi broadcast.
Cùng invocation ID gửi lại luôn nhận cùng receipt. Mỗi worker có key và gas budget riêng.`,

  // Contract
  `Approver không được trùng executor.
Pause chặn fund job và grant mới, người dùng vẫn revoke và reclaim nên không ai giam được tiền.
Trần fee là immutable.`,
];
