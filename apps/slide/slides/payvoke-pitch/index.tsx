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

// Osaka Jade daylight, theo DESIGN.md.
export const design: DesignSystem = {
  palette: { bg: "#f4f7f5", text: "#182e24", accent: "#286346" },
  fonts: {
    display: '"Geist", system-ui, sans-serif',
    body: '"JetBrains Mono", ui-monospace, monospace',
  },
  typeScale: { hero: 160, body: 28 },
  radius: 0,
};

const surface = "#fcfdfc";
const surface2 = "#e2ebe5";
const brandSoft = "#dcebe1";
const brandInk = "#f8fbf9";
const border = "#d3dfd7";
const borderStrong = "#81968a";
const bodyColor = "#465d50";
const muted = "#536b5d";
const destructive = "#a52b35";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap";
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

const EASE_OUT = "cubic-bezier(0, 0, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

export const transition: SlideTransition = {
  duration: 240,
  exit: { duration: 240, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 240,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ],
  },
};

// Lưới pixel 40px cho cover và closing.
const pixelGrid: CSSProperties = {
  backgroundImage: `linear-gradient(${border} 1px, transparent 1px), linear-gradient(90deg, ${border} 1px, transparent 1px)`,
  backgroundSize: "40px 40px",
  backgroundPosition: "-1px -1px",
};

const display = "var(--osd-font-display)";
const mono = "var(--osd-font-body)";

// ---------- Khung chung ----------

const Footer = () => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        bottom: 44,
        display: "flex",
        justifyContent: "space-between",
        fontFamily: mono,
        fontSize: 20,
        letterSpacing: "0.12em",
        color: muted,
      }}
    >
      <span>PAYVOKE · AVALANCHE FUJI</span>
      <span>
        {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
      </span>
    </div>
  );
};

const Frame = ({ children, grid }: { children: ReactNode; grid?: boolean }) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: "100%",
      boxSizing: "border-box",
      padding: "104px 120px 130px",
      background: "var(--osd-bg)",
      color: "var(--osd-text)",
      fontFamily: mono,
      ...(grid ? pixelGrid : {}),
    }}
  >
    {children}
    <Footer />
  </div>
);

const Eyebrow = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      fontFamily: mono,
      fontSize: 22,
      fontWeight: 500,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: "var(--osd-accent)",
    }}
  >
    {children}
  </div>
);

const Heading = ({ children }: { children: ReactNode }) => (
  <h2
    style={{
      fontFamily: display,
      fontSize: 72,
      fontWeight: 700,
      lineHeight: 1.12,
      letterSpacing: "-0.02em",
      margin: "22px 0 0",
    }}
  >
    {children}
  </h2>
);

const Brand = ({ children }: { children: ReactNode }) => (
  <span style={{ color: "var(--osd-accent)" }}>{children}</span>
);

const Card = ({
  children,
  accent,
  style,
}: {
  children: ReactNode;
  accent?: boolean;
  style?: CSSProperties;
}) => (
  <div
    style={{
      background: surface,
      border: `1px solid ${accent ? "var(--osd-accent)" : border}`,
      borderTop: `4px solid ${accent ? "var(--osd-accent)" : borderStrong}`,
      borderRadius: "var(--osd-radius)",
      padding: 40,
      boxSizing: "border-box",
      ...style,
    }}
  >
    {children}
  </div>
);

const CardTitle = ({ children, brand }: { children: ReactNode; brand?: boolean }) => (
  <div
    style={{
      fontFamily: display,
      fontSize: 38,
      fontWeight: 600,
      lineHeight: 1.2,
      color: brand ? "var(--osd-accent)" : "var(--osd-text)",
    }}
  >
    {children}
  </div>
);

const Banner = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      marginTop: 56,
      padding: "28px 40px",
      background: brandSoft,
      fontFamily: display,
      fontSize: 40,
      fontWeight: 600,
    }}
  >
    {children}
  </div>
);

const Pill = ({ children }: { children: ReactNode }) => (
  <span
    style={{
      display: "inline-block",
      padding: "6px 14px",
      background: brandSoft,
      color: "var(--osd-accent)",
      fontFamily: mono,
      fontSize: 20,
      fontWeight: 500,
      letterSpacing: "0.06em",
      verticalAlign: "middle",
    }}
  >
    {children}
  </span>
);

const Code = ({ children, size = 24 }: { children: string; size?: number }) => (
  <pre
    style={{
      margin: 0,
      padding: "32px 36px",
      background: "#eaf0ec",
      border: `1px solid ${border}`,
      fontFamily: mono,
      fontSize: size,
      lineHeight: 1.55,
      color: "var(--osd-text)",
      whiteSpace: "pre",
    }}
  >
    {children}
  </pre>
);

const Caption = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div style={{ fontSize: 22, lineHeight: 1.5, color: muted, ...style }}>{children}</div>
);

const FlowStep = ({ n, title, children }: { n: string; title: string; children: ReactNode }) => (
  <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
    <div
      style={{
        flex: "none",
        width: 60,
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--osd-accent)",
        color: brandInk,
        fontSize: 28,
        fontWeight: 700,
      }}
    >
      {n}
    </div>
    <div>
      <div style={{ fontFamily: display, fontSize: 36, fontWeight: 600, lineHeight: 1.2 }}>
        {title}
      </div>
      <div style={{ fontSize: 25, lineHeight: 1.5, color: bodyColor, marginTop: 8 }}>
        {children}
      </div>
    </div>
  </div>
);

// Bảng hai cột: vấn đề bên trái, cách Payvoke xử lý bên phải.
const tableCell: CSSProperties = { padding: "22px 32px", borderBottom: `1px solid ${border}` };

const TableHead = ({ left, right }: { left: string; right: string }) => (
  <>
    <div
      style={{
        ...tableCell,
        padding: "18px 32px",
        fontSize: 22,
        color: muted,
        letterSpacing: "0.1em",
      }}
    >
      {left}
    </div>
    <div
      style={{
        ...tableCell,
        padding: "18px 32px",
        fontSize: 22,
        color: "var(--osd-accent)",
        fontWeight: 700,
        letterSpacing: "0.1em",
      }}
    >
      {right}
    </div>
  </>
);

const FixRow = ({ risk, fix }: { risk: string; fix: string }) => (
  <>
    <div style={{ ...tableCell, fontSize: 26, lineHeight: 1.4, color: bodyColor }}>{risk}</div>
    <div style={{ ...tableCell, fontSize: 26, lineHeight: 1.4, display: "flex", gap: 16 }}>
      <span style={{ color: "var(--osd-accent)", fontWeight: 700 }}>✓</span>
      <span>{fix}</span>
    </div>
  </>
);

const Table = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      marginTop: 48,
      background: surface,
      border: `1px solid ${border}`,
    }}
  >
    {children}
  </div>
);

// ---------- 1. Cover ----------

const Cover: Page = () => (
  <Frame grid>
    <div
      style={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div style={{ maxWidth: 1120 }}>
        <Eyebrow>Hackathon 2026 · Avalanche Fuji</Eyebrow>
        <h1
          style={{
            fontFamily: display,
            fontSize: "var(--osd-size-hero)",
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: "-0.04em",
            margin: "28px 0 40px",
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
            margin: 0,
          }}
        >
          Bạn làm agent.
          <br />
          <Brand>Payvoke lo chuyện bán.</Brand>
        </p>
        <p style={{ fontSize: 28, lineHeight: 1.6, color: bodyColor, margin: "36px 0 0" }}>
          Thu USDC theo từng lần gọi, tiền được giữ an toàn đến khi giao xong.
        </p>
      </div>
      <div
        style={{
          width: 420,
          height: 420,
          background: surface,
          border: `1px solid ${border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img src={logo} alt="" style={{ width: 300, height: 300 }} />
      </div>
    </div>
    <Caption style={{ position: "absolute", left: 120, bottom: 96 }}>
      TODO: tên đội · thành viên
    </Caption>
  </Frame>
);

// ---------- 2. Câu chuyện của A ----------

const Hurdle = ({ q, children }: { q: string; children: ReactNode }) => (
  <div
    style={{ flex: 1, padding: "26px 30px", background: surface, border: `1px solid ${border}` }}
  >
    <div style={{ fontFamily: display, fontSize: 32, fontWeight: 600, color: destructive }}>
      {q}
    </div>
    <div style={{ fontSize: 25, lineHeight: 1.5, color: bodyColor, marginTop: 10 }}>{children}</div>
  </div>
);

const StoryA: Page = () => (
  <Frame>
    <Eyebrow>Câu chuyện của A</Eyebrow>
    <p
      style={{
        fontFamily: display,
        fontSize: 68,
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: "-0.02em",
        margin: "32px 0 0",
        maxWidth: 1560,
      }}
    >
      A vừa làm xong một AI agent chuyên thiết kế landing page.
    </p>
    <p
      style={{
        fontSize: 28,
        lineHeight: 1.55,
        color: bodyColor,
        margin: "24px 0 0",
        maxWidth: 1500,
      }}
    >
      Gom hết kinh nghiệm code và bộ AI skills của mình: mô tả sản phẩm, vài phút sau có trang web.
    </p>
    <p style={{ fontFamily: display, fontSize: 36, fontWeight: 600, margin: "48px 0 0" }}>
      A muốn chia sẻ cho mọi người dùng, và có chút thu nhập. <Brand>Nhưng…</Brand>
    </p>
    <div style={{ display: "flex", gap: 24, marginTop: 32 }}>
      <Hurdle q="Thu tiền thế nào?">
        Tự làm đăng nhập, cổng thanh toán, hoàn tiền mất cả tháng.
      </Hurdle>
      <Hurdle q="Người lạ có dám trả?">Khách sợ trả rồi không nhận được trang.</Hurdle>
      <Hurdle q="Ai trả tiền LLM?">Mở miễn phí thì mỗi lượt chạy A tự gánh.</Hurdle>
    </div>
  </Frame>
);

// ---------- 3. Lợi ích cho A ----------

const Gain = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card style={{ padding: "30px 36px", height: 220 }}>
    <div style={{ fontFamily: display, fontSize: 36, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 26, lineHeight: 1.5, color: bodyColor, marginTop: 14 }}>{children}</div>
  </Card>
);

const BenefitsA: Page = () => (
  <Frame>
    <Eyebrow>Với Payvoke</Eyebrow>
    <Heading>A chỉ việc đăng agent lên</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginTop: 56 }}>
      <Gain title="Lên store ngay">Khai báo lệnh /landing, đặt giá 5 USDC.</Gain>
      <Gain title="Lượt nào cũng có lời">Thu theo từng trang, đủ bù tiền LLM.</Gain>
      <Gain title="Khách dám trả lần đầu">Tiền khoá trong contract, trễ thì tự hoàn.</Gain>
      <Gain title="Không viết dòng billing nào">Thanh toán, hoàn tiền, khung chat có sẵn.</Gain>
      <Gain title="Tiền về ví của A">Giao xong, tiền tự mở. Không ai giữ hộ.</Gain>
      <Gain title="Agent khác cũng gọi được">Claude dùng agent của A qua MCP.</Gain>
    </div>
  </Frame>
);

// ---------- 4. Vì sao là bây giờ ----------

const Shift = ({ tag, title, children }: { tag: string; title: string; children: ReactNode }) => (
  <div style={{ flex: 1, borderLeft: `4px solid var(--osd-accent)`, paddingLeft: 36 }}>
    <Pill>{tag}</Pill>
    <div
      style={{ fontFamily: display, fontSize: 42, fontWeight: 700, lineHeight: 1.2, marginTop: 24 }}
    >
      {title}
    </div>
    <div style={{ fontSize: 27, lineHeight: 1.55, color: bodyColor, marginTop: 16 }}>
      {children}
    </div>
  </div>
);

const WhyNow: Page = () => (
  <Frame>
    <Eyebrow>Vì sao là bây giờ</Eyebrow>
    <Heading>Thời điểm đã chín</Heading>
    <div style={{ display: "flex", gap: 56, marginTop: 72 }}>
      <Shift tag="MCP" title="Agent tự dùng tool">
        Khách hàng mới không chỉ là người, mà còn là agent.
      </Shift>
      <Shift tag="x402" title="Trả tiền ngay trong HTTP">
        Không cần tài khoản, không cần thẻ.
      </Shift>
      <Shift tag="USDC · Avalanche" title="Đủ rẻ để bán vài cent">
        Phí thấp, xác nhận nhanh.
      </Shift>
    </div>
    <div style={{ marginTop: 40 }}>
      <Banner>
        Hạ tầng có rồi. <Brand>Chỉ thiếu một chỗ để bán.</Brand>
      </Banner>
    </div>
  </Frame>
);

// ---------- 5. Giải pháp ----------

const Duty = ({ title, children }: { title: string; children: ReactNode }) => (
  <div style={{ display: "flex", gap: 20 }}>
    <div
      style={{
        flex: "none",
        width: 14,
        height: 14,
        marginTop: 16,
        background: "var(--osd-accent)",
      }}
    />
    <div>
      <div style={{ fontFamily: display, fontSize: 34, fontWeight: 600, lineHeight: 1.25 }}>
        {title}
      </div>
      <div style={{ fontSize: 24, lineHeight: 1.45, color: bodyColor, marginTop: 4 }}>
        {children}
      </div>
    </div>
  </div>
);

const Solution: Page = () => (
  <Frame>
    <Eyebrow>Giải pháp</Eyebrow>
    <Heading>Bạn lo agent, Payvoke lo phần còn lại</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 40, marginTop: 52 }}>
      <Card style={{ height: 640 }}>
        <CardTitle>Việc của bạn</CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 40 }}>
          <Duty title="Chạy agent">Ở đâu cũng được, có LLM hay không.</Duty>
          <Duty title="Khai báo command">Giá, hạn giao, chính sách hoàn.</Duty>
          <Duty title="Giao kết quả">Nhận việc, làm, trả về.</Duty>
        </div>
      </Card>
      <Steps>
        <Step>
          <Card accent style={{ height: 640, padding: "36px 40px" }}>
            <CardTitle brand>Việc của Payvoke</CardTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 28 }}>
              <Duty title="Cửa hàng">Khách tìm thấy app của bạn.</Duty>
              <Duty title="Khung chat chung">Một giao diện cho mọi app.</Duty>
              <Duty title="Báo giá và thu tiền">Tính theo từng lần gọi.</Duty>
              <Duty title="Giữ tiền an toàn">Giao xong mới trả, không giao thì hoàn.</Duty>
              <Duty title="Kênh cho AI agent">Agent khác gọi được app của bạn.</Duty>
            </div>
          </Card>
        </Step>
      </Steps>
    </div>
  </Frame>
);

// ---------- 5b. Ví dụ app ----------

const UseCase = ({
  kind,
  command,
  title,
  children,
  price,
  time,
}: {
  kind: string;
  command: string;
  title: string;
  children: ReactNode;
  price: string;
  time: string;
}) => (
  <Card style={{ height: 276, padding: "28px 32px", display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: "var(--osd-accent)" }}>{command}</span>
      <Pill>{kind}</Pill>
    </div>
    <div
      style={{ fontFamily: display, fontSize: 34, fontWeight: 600, lineHeight: 1.2, marginTop: 18 }}
    >
      {title}
    </div>
    <div style={{ fontSize: 23, lineHeight: 1.45, color: bodyColor, marginTop: 8 }}>{children}</div>
    <div
      style={{
        marginTop: "auto",
        paddingTop: 14,
        borderTop: `1px solid ${border}`,
        display: "flex",
        justifyContent: "space-between",
        fontSize: 22,
      }}
    >
      <b style={{ color: "var(--osd-accent)" }}>{price}</b>
      <span style={{ color: muted }}>{time}</span>
    </div>
  </Card>
);

const UseCases: Page = () => (
  <Frame>
    <Eyebrow>Ví dụ · giá minh hoạ</Eyebrow>
    <Heading>Agent hay tool, đều bán được</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24, marginTop: 40 }}>
      <UseCase
        kind="AI agent"
        command="/review-cv"
        title="Review CV"
        price="0,50 USDC"
        time="5 phút"
      >
        Chấm CV theo vị trí, gợi ý sửa.
      </UseCase>
      <UseCase kind="AI agent" command="/logo" title="Thiết kế logo" price="2 USDC" time="30 phút">
        Mô tả thương hiệu, nhận 3 mẫu.
      </UseCase>
      <UseCase
        kind="AI agent"
        command="/landing"
        title="Làm landing page"
        price="5 USDC"
        time="30 phút"
      >
        Agent của A: mô tả là có trang.
      </UseCase>
      <UseCase
        kind="Tool"
        command="/pdf-to-excel"
        title="PDF sang Excel"
        price="0,02 USDC"
        time="1 phút"
      >
        Không cần LLM, vài xu mỗi lần.
      </UseCase>
      <UseCase
        kind="AI agent"
        command="/research"
        title="Nghiên cứu thị trường"
        price="1 USDC"
        time="15 phút"
      >
        Đối thủ, bảng giá, điểm khác biệt.
      </UseCase>
      <UseCase
        kind="AI agent"
        command="/summarize"
        title="Tóm tắt hợp đồng"
        price="0,10 USDC"
        time="10 phút"
      >
        Rút ra các điều khoản đáng chú ý.
      </UseCase>
    </div>
  </Frame>
);

// ---------- 7. Cho builder ----------

const commandJson = `{
  "name": "landing",
  "options": [
    { "name": "brief", "type": "STRING" }
  ],
  "grossAmount": "5000000",
  "terms": {
    "deliverySeconds": 1800,
    "refundPolicy": "Không giao → hoàn 100%"
  }
}`;

const BuilderJourney: Page = () => (
  <Frame>
    <Eyebrow>Cho builder</Eyebrow>
    <Heading>Bốn bước để A bắt đầu bán</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 820px", gap: 72, marginTop: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 44 }}>
        <FlowStep n="1" title="Tạo app">
          Đăng nhập bằng ví, chọn ví nhận tiền.
        </FlowStep>
        <FlowStep n="2" title="Khai báo command">
          Input, giá và điều khoản.
        </FlowStep>
        <FlowStep n="3" title="Kết nối agent">
          Nhận việc, gửi kết quả về.
        </FlowStep>
        <FlowStep n="4" title="Nhận tiền">
          Giao đúng hạn, tiền tự về ví.
        </FlowStep>
      </div>
      <div>
        <Code size={26}>{commandJson}</Code>
        <Caption style={{ marginTop: 16 }}>Lệnh /landing của A: 5 USDC, giao trong 30 phút</Caption>
      </div>
    </div>
  </Frame>
);

// ---------- 8. Cho người dùng ----------

const Bubble = ({ from, children }: { from: "buyer" | "app"; children: ReactNode }) => (
  <div style={{ display: "flex", justifyContent: from === "buyer" ? "flex-end" : "flex-start" }}>
    <div
      style={{
        maxWidth: 640,
        padding: "16px 22px",
        fontSize: 24,
        lineHeight: 1.45,
        background: from === "buyer" ? surface2 : surface,
        border: `1px solid ${from === "buyer" ? surface2 : border}`,
      }}
    >
      {children}
    </div>
  </div>
);

const QuoteCard = () => (
  <div style={{ border: `2px solid var(--osd-accent)`, background: surface, padding: "20px 24px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}>
      <span>
        <b>Báo giá</b> · /landing
      </span>
      <b style={{ color: "var(--osd-accent)" }}>5 USDC</b>
    </div>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 20,
        color: muted,
        marginTop: 8,
      }}
    >
      <span>Giao trong 30 phút</span>
      <span>Không giao thì hoàn 100%</span>
    </div>
    <div
      style={{
        marginTop: 16,
        padding: "12px 0",
        textAlign: "center",
        background: "var(--osd-accent)",
        color: brandInk,
        fontSize: 24,
        fontWeight: 700,
      }}
    >
      Authorize
    </div>
  </div>
);

const ResultCard = () => (
  <div
    style={{
      background: brandSoft,
      borderLeft: `4px solid var(--osd-accent)`,
      padding: "16px 22px",
    }}
  >
    <div
      style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.1em", color: "var(--osd-accent)" }}
    >
      ĐÃ GIAO · ĐÃ KIỂM TRA
    </div>
    <div style={{ fontSize: 24, lineHeight: 1.45, marginTop: 6 }}>
      Landing page 5 mục, link xem thử, kèm mã nguồn
    </div>
  </div>
);

const BuyerExperience: Page = () => (
  <Frame>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 820px", gap: 72, height: "100%" }}>
      <div>
        <Eyebrow>Cho người dùng</Eyebrow>
        <Heading>
          Với khách,
          <br />
          chỉ là khung chat
        </Heading>
        <div style={{ display: "flex", flexDirection: "column", gap: 44, marginTop: 60 }}>
          <FlowStep n="1" title="Gõ lệnh">
            /landing, hoặc gõ tự nhiên.
          </FlowStep>
          <FlowStep n="2" title="Xem giá, bấm Authorize">
            Biết trước giá và chính sách hoàn.
          </FlowStep>
          <FlowStep n="3" title="Nhận kết quả">
            Được kiểm tra trước khi giao.
          </FlowStep>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: surface,
          border: `1px solid ${borderStrong}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "20px 28px",
            borderBottom: `1px solid ${border}`,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 14, height: 14, background: "var(--osd-accent)" }} />
          Landing Page Pro
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, padding: 28 }}>
          <Steps>
            <Bubble from="buyer">
              <b>/landing</b> Quán cà phê Mộc, tối giản
              <div style={{ fontSize: 20, color: muted, marginTop: 6 }}>Đính kèm: logo_moc.png</div>
            </Bubble>
            <Step>
              <Bubble from="app">Bạn thích tông màu nào?</Bubble>
            </Step>
            <Step>
              <Bubble from="buyer">Nâu và kem</Bubble>
            </Step>
            <Step>
              <QuoteCard />
            </Step>
            <Step>
              <ResultCard />
            </Step>
          </Steps>
        </div>
        <div
          style={{
            padding: "20px 28px",
            borderTop: `1px solid ${border}`,
            fontSize: 22,
            color: muted,
          }}
        >
          Nhập yêu cầu hoặc gõ / để chọn lệnh…
        </div>
      </div>
    </div>
  </Frame>
);

// ---------- 9. Tính năng chính ----------

const Feature = ({ title, children }: { title: string; children: ReactNode }) => (
  <Card style={{ padding: "32px 36px", height: 220 }}>
    <div style={{ fontFamily: display, fontSize: 36, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 26, lineHeight: 1.5, color: bodyColor, marginTop: 14 }}>{children}</div>
  </Card>
);

const Features: Page = () => (
  <Frame>
    <Eyebrow>Tính năng</Eyebrow>
    <Heading>Những gì đã có sẵn</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, marginTop: 56 }}>
      <Feature title="Báo giá trước khi trả">Landing page: 5 USDC, xong trong 30 phút.</Feature>
      <Feature title="Giá theo phiên bản">Builder tăng giá, đơn đang chạy vẫn giá cũ.</Feature>
      <Feature title="Hỏi lại trong chat">Agent hỏi: “Bạn thích tông màu nào?”</Feature>
      <Feature title="Kiểm tra trước khi giao">Kết quả phải đúng định dạng đã hứa.</Feature>
      <Feature title="Hạn mức chi">Ví dụ: tối đa 1 USDC mỗi lần, 20 USDC mỗi tháng.</Feature>
      <Feature title="Hoàn tiền tự động">Giao trễ: Bình được hoàn đủ 5 USDC.</Feature>
    </div>
  </Frame>
);

// ---------- 10. Kênh cho AI agent ----------

const Benefit = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "flex", gap: 16, fontSize: 28, lineHeight: 1.45, color: bodyColor }}>
    <span style={{ color: "var(--osd-accent)", fontWeight: 700 }}>✓</span>
    <span>{children}</span>
  </div>
);

const BridgeBox = ({ title, sub, strong }: { title: string; sub: string; strong?: boolean }) => (
  <div
    style={{
      padding: "12px 22px",
      background: strong ? brandSoft : surface,
      border: `1px solid ${strong ? "var(--osd-accent)" : border}`,
    }}
  >
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 20, color: muted }}>{sub}</div>
  </div>
);

const Down = () => (
  <div style={{ textAlign: "center", fontSize: 26, lineHeight: 1, color: borderStrong }}>↓</div>
);

const Mcp: Page = () => (
  <Frame>
    <Eyebrow>MCP · kênh phân phối</Eyebrow>
    <Heading>Agent khác cũng là khách của A</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 700px", gap: 72, marginTop: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 40, paddingTop: 12 }}>
        <Benefit>Claude hay agent trong IDE gọi app qua MCP</Benefit>
        <Benefit>A không phải viết MCP server nào</Benefit>
        <Benefit>Chi tiền luôn cần người dùng đồng ý</Benefit>
        <Benefit>
          <Brand>Thêm một nguồn thu, cùng cơ chế giữ tiền.</Brand>
        </Benefit>
      </div>
      <Card accent style={{ padding: "28px 32px" }}>
        <CardTitle>MCP bridge</CardTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 20 }}>
          <BridgeBox title="Claude / agent trong IDE" sub="gọi tool qua MCP" />
          <Down />
          <BridgeBox title="Payvoke bridge" sub="trên máy người dùng, giữ khoá phiên" strong />
          <Down />
          <BridgeBox title="Payvoke" sub="báo giá, giữ tiền như trên web" />
          <Down />
          <BridgeBox title="Agent của A" sub="nhận việc như bình thường" />
        </div>
      </Card>
    </div>
  </Frame>
);

// ---------- 10b. Dùng MCP trong Claude ----------

const ToolCall = ({ tool, children }: { tool: string; children: ReactNode }) => (
  <div
    style={{
      display: "flex",
      gap: 14,
      alignItems: "baseline",
      padding: "10px 18px",
      background: "#eaf0ec",
      border: `1px dashed ${borderStrong}`,
      fontSize: 21,
    }}
  >
    <b style={{ color: "var(--osd-accent)" }}>{tool}</b>
    <span style={{ color: bodyColor }}>{children}</span>
  </div>
);

const ConfirmCard = () => (
  <div style={{ border: `2px solid var(--osd-accent)`, background: surface, padding: "16px 22px" }}>
    <div style={{ fontSize: 23 }}>
      Cho phép chi <b style={{ color: "var(--osd-accent)" }}>5 USDC</b> cho Landing Page Pro?
    </div>
    <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
      <span
        style={{
          padding: "8px 22px",
          background: "var(--osd-accent)",
          color: brandInk,
          fontSize: 21,
          fontWeight: 700,
        }}
      >
        Đồng ý
      </span>
      <span style={{ padding: "8px 22px", border: `1px solid ${borderStrong}`, fontSize: 21 }}>
        Huỷ
      </span>
    </div>
  </div>
);

const McpUsage: Page = () => (
  <Frame>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 860px", gap: 64, height: "100%" }}>
      <div>
        <Eyebrow>MCP · cách dùng</Eyebrow>
        <Heading>
          Nhờ Claude,
          <br />
          Claude tự thuê agent
        </Heading>
        <div style={{ display: "flex", flexDirection: "column", gap: 40, marginTop: 56 }}>
          <FlowStep n="1" title="Cài Payvoke bridge">
            Thêm vài dòng cấu hình vào Claude.
          </FlowStep>
          <FlowStep n="2" title="Liên kết tài khoản">
            Đăng nhập web, cấp hạn mức một lần.
          </FlowStep>
          <FlowStep n="3" title="Cứ thế nhờ Claude">
            Claude tìm app, báo giá, chờ bạn đồng ý.
          </FlowStep>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          background: surface,
          border: `1px solid ${borderStrong}`,
        }}
      >
        <div
          style={{
            padding: "18px 28px",
            borderBottom: `1px solid ${border}`,
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          Claude
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, padding: 28 }}>
          <Steps>
            <Bubble from="buyer">Làm giúp mình landing page cho quán cà phê Mộc</Bubble>
            <Step>
              <ToolCall tool="search_apps">→ Landing Page Pro (của A)</ToolCall>
            </Step>
            <Step>
              <ToolCall tool="prepare_invocation">→ 5 USDC, giao trong 30 phút</ToolCall>
            </Step>
            <Step>
              <ConfirmCard />
            </Step>
            <Step>
              <ToolCall tool="get_result">→ landing page đã giao</ToolCall>
            </Step>
            <Step>
              <Bubble from="app">Xong rồi! Đây là trang của quán Mộc…</Bubble>
            </Step>
          </Steps>
        </div>
        <div
          style={{
            padding: "20px 28px",
            borderTop: `1px solid ${border}`,
            fontSize: 22,
            color: muted,
          }}
        >
          Hỏi Claude bất cứ điều gì…
        </div>
      </div>
    </div>
  </Frame>
);

// ---------- 11. Escrow ----------

const FlowBox = ({
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
  tone?: "plain" | "brand" | "good" | "back";
}) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: 84,
      boxSizing: "border-box",
      padding: "12px 22px",
      background: tone === "brand" ? "var(--osd-accent)" : tone === "good" ? brandSoft : surface,
      color: tone === "brand" ? brandInk : "var(--osd-text)",
      border: `1px solid ${tone === "brand" ? "var(--osd-accent)" : tone === "back" ? borderStrong : border}`,
    }}
  >
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 20, lineHeight: 1.4, opacity: 0.85, marginTop: 2 }}>{sub}</div>
  </div>
);

const Escrow: Page = () => (
  <Frame>
    <Eyebrow>Thanh toán · nói đơn giản</Eyebrow>
    <Heading>Tiền được khoá lại, giao xong mới mở</Heading>
    <div style={{ position: "relative", width: 1680, height: 290, marginTop: 52 }}>
      <svg width={1680} height={290} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker
            id="pv-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill={borderStrong} />
          </marker>
        </defs>
        <g stroke={borderStrong} strokeWidth={2} fill="none" markerEnd="url(#pv-arrow)">
          <path d="M300 145H372" />
          <path d="M672 145H744" />
          <path d="M1074 145C1130 145 1130 42 1202 42" />
          <path d="M1074 145H1202" />
          <path d="M1074 145C1130 145 1130 248 1202 248" />
        </g>
      </svg>
      <FlowBox x={0} y={103} w={300} title="Bình nạp 20 USDC" sub="vào PayvokeVault" />
      <FlowBox x={372} y={103} w={300} title="Số dư của Bình" sub="dùng dần mỗi lần gọi" />
      <FlowBox
        x={744}
        y={103}
        w={330}
        title="Khoá 5 USDC"
        sub="cho landing page này"
        tone="brand"
      />
      <FlowBox x={1206} y={0} w={474} title="Trả cho A" sub="giao trang đúng hạn" tone="good" />
      <FlowBox
        x={1206}
        y={103}
        w={474}
        title="Trả lại Bình"
        sub="lỗi, trễ hoặc không giao"
        tone="back"
      />
      <FlowBox
        x={1206}
        y={206}
        w={474}
        title="Bình tự rút lại"
        sub="quá hạn mà chưa ai xử lý"
        tone="back"
      />
    </div>
    <Banner>
      Giống sàn TMĐT giữ tiền đến khi nhận hàng.{" "}
      <Brand>Nhưng người giữ là smart contract, không phải công ty.</Brand>
    </Banner>
  </Frame>
);

// ---------- 12. x402 ----------

const Lane = ({ x, title, sub }: { x: number; title: string; sub: string }) => (
  <div
    style={{
      position: "absolute",
      left: x - 190,
      top: 0,
      width: 380,
      height: 84,
      boxSizing: "border-box",
      padding: "8px 0",
      textAlign: "center",
      background: surface,
      border: `1px solid ${borderStrong}`,
    }}
  >
    <div style={{ fontFamily: display, fontSize: 28, fontWeight: 600 }}>{title}</div>
    <div style={{ fontSize: 18, color: muted }}>{sub}</div>
  </div>
);

const Msg = ({
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
}) => (
  <div
    style={{
      position: "absolute",
      left: Math.min(from, to),
      top: y - 34,
      width: Math.abs(to - from),
      textAlign: "center",
      fontSize: 22,
      fontWeight: strong ? 700 : 400,
      color: strong ? "var(--osd-accent)" : "var(--osd-text)",
    }}
  >
    {children}
  </div>
);

// Toạ độ trục dọc của ba bên trong sơ đồ x402.
const LANE_BUYER = 260;
const LANE_PAYVOKE = 840;
const LANE_CHAIN = 1420;

const X402: Page = () => (
  <Frame>
    <Eyebrow>Blockchain · x402</Eyebrow>
    <Heading>x402: trả tiền ngay trong một request web</Heading>
    <Caption style={{ marginTop: 16, fontSize: 24 }}>
      HTTP có sẵn mã 402 “Payment Required” từ lâu mà chưa ai dùng. x402 biến nó thành cách trả tiền
      chuẩn, người hay máy đều dùng được.
    </Caption>
    <div style={{ position: "relative", width: 1680, height: 500, marginTop: 28 }}>
      <svg width={1680} height={500} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <marker
            id="pv-seq"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="8"
            markerHeight="8"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill={borderStrong} />
          </marker>
        </defs>
        <g stroke={border} strokeWidth={2} strokeDasharray="6 6">
          <path d={`M${LANE_BUYER} 84V500`} />
          <path d={`M${LANE_PAYVOKE} 84V500`} />
          <path d={`M${LANE_CHAIN} 84V500`} />
        </g>
        <g stroke={borderStrong} strokeWidth={2} fill="none" markerEnd="url(#pv-seq)">
          <path d={`M${LANE_BUYER} 140H${LANE_PAYVOKE - 4}`} />
          <path d={`M${LANE_PAYVOKE} 212H${LANE_BUYER + 4}`} />
          <path d={`M${LANE_BUYER} 284H${LANE_PAYVOKE - 4}`} />
          <path d={`M${LANE_PAYVOKE} 356H${LANE_CHAIN - 4}`} />
          <path d={`M${LANE_CHAIN} 428H${LANE_PAYVOKE + 4}`} />
          <path d={`M${LANE_PAYVOKE} 490H${LANE_BUYER + 4}`} />
        </g>
      </svg>
      <Lane x={LANE_BUYER} title="Máy của Bình" sub="web hoặc agent" />
      <Lane x={LANE_PAYVOKE} title="Payvoke" sub="nơi bán agent của A" />
      <Lane x={LANE_CHAIN} title="Avalanche" sub="PayvokeVault" />
      <Msg from={LANE_BUYER} to={LANE_PAYVOKE} y={140}>
        1. Gọi /landing
      </Msg>
      <Msg from={LANE_BUYER} to={LANE_PAYVOKE} y={212} strong>
        2. 402: cần 5 USDC
      </Msg>
      <Msg from={LANE_BUYER} to={LANE_PAYVOKE} y={284}>
        3. Gọi lại, kèm chữ ký
      </Msg>
      <Msg from={LANE_PAYVOKE} to={LANE_CHAIN} y={356}>
        4. Khoá 5 USDC vào vault
      </Msg>
      <Msg from={LANE_PAYVOKE} to={LANE_CHAIN} y={428}>
        5. Đã chốt, không đảo được
      </Msg>
      <Msg from={LANE_BUYER} to={LANE_PAYVOKE} y={490} strong>
        6. 200: đã nhận việc
      </Msg>
    </div>
  </Frame>
);

// ---------- 13. Payvoke so với x402 thông thường ----------

const X402Payvoke: Page = () => (
  <Frame>
    <Eyebrow>Blockchain · x402</Eyebrow>
    <Heading>Cùng x402, nhưng có lớp bảo vệ</Heading>
    <Table>
      <TableHead left="X402 THÔNG THƯỜNG" right="PAYVOKE" />
      <FixRow risk="Tiền chuyển thẳng cho người bán" fix="Tiền vào vault, giao xong mới mở" />
      <FixRow risk="Không giao thì khó đòi lại" fix="Lỗi, trễ, không giao: tự hoàn" />
      <FixRow risk="Chữ ký chỉ ghi người nhận và số tiền" fix="Ghi thêm lần gọi, báo giá, input" />
      <FixRow risk="Thường phải mở ví ký mỗi lần" fix="Khoá phiên tự ký, trong hạn mức" />
    </Table>
    <Banner>
      Cách gọi vẫn là x402. <Brand>Chỉ khác: tiền đi qua escrow thay vì chuyển thẳng.</Brand>
    </Banner>
  </Frame>
);

// ---------- 14. Khoá phiên hoạt động thế nào ----------

const ChainStep = ({
  n,
  tech,
  title,
  children,
}: {
  n: string;
  tech: string;
  title: string;
  children: ReactNode;
}) => (
  <Card style={{ height: 216, padding: "28px 36px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 18 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: "var(--osd-accent)" }}>{n}</span>
        <span style={{ fontFamily: display, fontSize: 34, fontWeight: 600 }}>{title}</span>
      </div>
      <Pill>{tech}</Pill>
    </div>
    <div style={{ fontSize: 25, lineHeight: 1.5, color: bodyColor, marginTop: 16 }}>{children}</div>
  </Card>
);

const SessionKey: Page = () => (
  <Frame>
    <Eyebrow>Blockchain · khoá phiên</Eyebrow>
    <Heading>Chi tự động mà không phải giao ví</Heading>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 48 }}>
      <ChainStep n="01" tech="trên máy Bình" title="Tạo khoá phiên">
        Máy tự tạo một khoá mới. Khoá bí mật không bao giờ rời máy.
      </ChainStep>
      <ChainStep n="02" tech="ví chính ký 1 lần" title="Đăng ký hạn mức">
        Ví gửi lên vault: khoá này chi tối đa 5 USDC/lần, 50 USDC/tháng.
      </ChainStep>
      <ChainStep n="03" tech="không bật ví" title="Ký từng lần gọi">
        Mỗi lần Authorize, khoá phiên ký. Vault kiểm tra đúng khoá, còn hạn mức.
      </ChainStep>
      <ChainStep n="04" tech="ví chính" title="Thu hồi tức thì">
        Bấm thu hồi là mọi chữ ký của khoá đó hết hiệu lực.
      </ChainStep>
    </div>
    <Banner>
      Khoá phiên không rút được tiền. <Brand>Lộ thì thiệt tối đa bằng hạn mức.</Brand>
    </Banner>
  </Frame>
);

// ---------- 14. Nghiên cứu: thanh toán đúng ----------

const ResearchCorrectness: Page = () => (
  <Frame>
    <Eyebrow>Áp dụng từ nghiên cứu</Eyebrow>
    <Heading>Lỗ hổng x402 đã được chỉ ra, và cách chặn</Heading>
    <Caption style={{ marginTop: 20, fontSize: 24 }}>
      Các nhóm nghiên cứu thử nhiều facilitator x402 đang chạy: cái nào cũng dính ít nhất một lỗi.
    </Caption>
    <Table>
      <TableHead left="LỖI ĐÃ ĐƯỢC CHỈ RA" right="PAYVOKE XỬ LÝ" />
      <FixRow
        risk="Báo đã trả tiền khi tiền chưa về"
        fix="Chỉ xác nhận khi khoản giữ đã chốt trên chain"
      />
      <FixRow
        risk="Lấy chữ ký của việc này mở việc khác"
        fix="Chữ ký gắn mã lần gọi, báo giá và input"
      />
      <FixRow
        risk="Gửi đồng thời để bị trừ hai lần"
        fix="Contract chỉ cho mỗi lần gọi dùng một lần"
      />
      <FixRow
        risk="Kiểu “trả tối đa” bị chi vượt"
        fix="Giá cố định, contract tự cộng dồn hạn mức"
      />
      <FixRow
        risk="Làm trước thu sau, khách rút tiền giữa chừng"
        fix="Giữ tiền xong mới giao việc"
      />
    </Table>
  </Frame>
);

// ---------- 15. Nghiên cứu: chống lạm dụng ----------

const ResearchAbuse: Page = () => (
  <Frame>
    <Eyebrow>Áp dụng từ nghiên cứu</Eyebrow>
    <Heading>Không để ai lợi dụng hệ thống</Heading>
    <Table>
      <TableHead left="CÁCH TẤN CÔNG" right="PAYVOKE XỬ LÝ" />
      <FixRow
        risk="Header thanh toán bị lộ, người khác dùng trước"
        fix="Chỉ relayer được uỷ quyền mới gửi lên vault"
      />
      <FixRow
        risk="Đốt gas của nền tảng bằng giao dịch rác"
        fix="Trần gas, chỉ ký đúng một hàm của vault"
      />
      <FixRow risk="Lộ prompt, dữ liệu khách qua metadata" fix="Header chỉ chứa mã và bản băm" />
      <FixRow
        risk="Tính giá theo token ẩn, dễ bị thổi phồng"
        fix="Giá cố định theo phiên bản command"
      />
      <FixRow
        risk="Trả tiền chỉ dựa vào lời provider tự khai"
        fix="Chỉ trả khi bằng chứng đạt mức đã cam kết"
      />
    </Table>
  </Frame>
);

// ---------- 16. An toàn của vault ----------

const VaultRule = ({
  title,
  example,
  children,
}: {
  title: string;
  example: string;
  children: ReactNode;
}) => (
  <Card style={{ padding: "28px 36px", height: 262 }}>
    <div style={{ fontFamily: display, fontSize: 34, fontWeight: 600, lineHeight: 1.2 }}>
      {title}
    </div>
    <div style={{ fontSize: 24, lineHeight: 1.5, color: "var(--osd-text)", marginTop: 12 }}>
      {children}
    </div>
    <div
      style={{
        fontSize: 22,
        lineHeight: 1.45,
        color: muted,
        marginTop: 12,
        paddingLeft: 16,
        borderLeft: `3px solid ${brandSoft}`,
      }}
    >
      {example}
    </div>
  </Card>
);

const VaultSafety: Page = () => (
  <Frame>
    <Eyebrow>Blockchain · contract</Eyebrow>
    <Heading>Kể cả Payvoke cũng không đụng được tiền</Heading>
    <Caption style={{ marginTop: 16, fontSize: 24 }}>
      Bốn luật dưới đây nằm sẵn trong code của PayvokeVault, không phải lời hứa của chúng tôi.
    </Caption>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 32 }}>
      <VaultRule
        title="Mỗi việc một khoá riêng"
        example="Lộ khoá gửi giao dịch? Không có chữ ký của Bình thì vẫn không khoá được đồng nào."
      >
        Gửi giao dịch, quyết định trả/hoàn, tạm dừng: mỗi việc dùng một khoá khác nhau.
      </VaultRule>
      <VaultRule
        title="Tạm dừng không giam tiền"
        example="Đang tạm dừng, Bình vẫn rút số dư về ví như bình thường."
      >
        Khi có sự cố, Payvoke chỉ dừng được các khoản thu mới.
      </VaultRule>
      <VaultRule
        title="Không có cửa sau"
        example="5 USDC của Bình chỉ đi 3 đường: về A, về lại Bình, hoặc Bình tự rút."
      >
        Không có hàm nào lấy tiền của khách, không âm thầm thay code contract được.
      </VaultRule>
      <VaultRule
        title="Phí có trần, chốt từng lần"
        example="Muốn nâng trần phí phải chờ một khoảng thời gian, ai cũng kịp thấy trước."
      >
        Phí tối đa ghi sẵn trong contract. Tỷ lệ phí chốt ngay lúc bấm Authorize.
      </VaultRule>
    </div>
  </Frame>
);

// ---------- 18. Closing ----------

const Closing: Page = () => (
  <Frame grid>
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <img src={logo} alt="" style={{ width: 120, height: 120 }} />
      <h2
        style={{
          fontFamily: display,
          fontSize: 112,
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: "-0.03em",
          margin: "48px 0 0",
        }}
      >
        Bạn làm agent.
        <br />
        <Brand>Payvoke lo chuyện bán.</Brand>
      </h2>
      <p style={{ fontSize: 30, color: bodyColor, margin: "48px 0 0" }}>
        Cảm ơn ban giám khảo. Mời mọi người đặt câu hỏi.
      </p>
      <Caption style={{ marginTop: 32 }}>TODO: link demo · link repo · liên hệ</Caption>
    </div>
  </Frame>
);

export const meta: SlideMeta = {
  title: "Payvoke",
  createdAt: "2026-10-26T09:14:47.657Z",
};

export default [
  Cover,
  StoryA,
  BenefitsA,
  WhyNow,
  Solution,
  UseCases,
  BuilderJourney,
  BuyerExperience,
  Features,
  Mcp,
  McpUsage,
  Escrow,
  X402,
  X402Payvoke,
  SessionKey,
  ResearchCorrectness,
  ResearchAbuse,
  VaultSafety,
  Closing,
] satisfies Page[];

export const notes: (string | undefined)[] = [
  `(~20s) Chào ban giám khảo, chúng tôi là [tên đội].
Payvoke dành cho người làm AI agent: bạn lo phần agent, chúng tôi lo chuyện bán.`,
  `(~40s) Đây là A. A vừa làm xong một AI agent chuyên thiết kế landing page, gom hết kinh nghiệm code và bộ AI skills của mình. Mô tả sản phẩm, vài phút sau có trang web.
A muốn chia sẻ cho mọi người dùng, và có chút thu nhập. Nhưng ngay lập tức gặp ba câu hỏi:
thu tiền thế nào khi tự làm thanh toán mất cả tháng; người lạ có dám trả trước không; và nếu mở miễn phí thì tiền LLM mỗi lượt chạy ai trả.`,
  `(~40s) Với Payvoke, A chỉ việc đăng agent lên.
Khai báo lệnh /landing, đặt giá 5 USDC, là có mặt trên store. Mỗi lượt đều thu tiền nên đủ bù chi phí LLM.
Khách dám trả ngay lần đầu vì tiền khoá trong contract, giao trễ thì tự hoàn. A không viết dòng billing nào. Giao xong, tiền tự về ví của A.
Và không chỉ người: Claude hay agent khác cũng gọi được agent của A.`,
  `(~30s) Vì sao là bây giờ?
Agent đã tự tìm và dùng tool qua MCP. x402 cho phép trả tiền ngay trong HTTP. USDC trên Avalanche đủ rẻ để bán vài cent mỗi lần.
Hạ tầng có rồi, chỉ thiếu một chỗ để bán.`,
  `(~30s) Payvoke chia việc rất rõ.
Bạn chạy agent, khai báo command, giao kết quả.
[→] Phần còn lại là của Payvoke: cửa hàng, khung chat, thu tiền, giữ tiền, và cả kênh để agent khác tìm tới bạn.`,
  `(~35s) Không chỉ landing page. Agent review CV, thiết kế logo, nghiên cứu thị trường, tóm tắt hợp đồng.
Không cần AI cũng được: một tool đổi PDF sang Excel, vài xu mỗi lần chạy. Cái gì gọi được là bán được.`,
  `(~30s) Với A, chỉ có bốn bước.
Tạo app bằng ví. Khai báo lệnh /landing: bên phải là toàn bộ cấu hình, giá 5 USDC, giao trong 30 phút.
Kết nối agent để nhận việc. Giao đúng hạn thì tiền tự về, không cần gửi hoá đơn.`,
  `(~40s) Còn người mua, ví dụ Bình, chủ quán cà phê Mộc, chỉ thấy một khung chat.
Bình gõ /landing, mô tả quán, đính kèm logo.
[→] Agent của A hỏi lại: thích tông màu nào?
[→] Bình trả lời: nâu và kem.
[→] Báo giá hiện ra: 5 USDC, 30 phút. Bình bấm Authorize.
[→] Trang được kiểm tra rồi mới giao: link xem thử và mã nguồn.
Nếu kịp thời gian, chuyển qua demo thật.`,
  `(~30s) Những tính năng đã có: biết giá trước khi trả; builder tăng giá thì đơn đang chạy vẫn giá cũ; agent hỏi lại ngay trong chat; kết quả phải đúng định dạng đã hứa; khách tự đặt hạn mức chi; và giao trễ thì Bình được hoàn đủ.`,
  `(~30s) Khách của A không chỉ là người. Qua MCP, Claude hay agent trong IDE cũng tìm và gọi được agent của A.
A không phải viết MCP server. Bridge chạy trên máy người dùng, giữ khoá phiên, và mọi lần chi tiền đều cần người dùng đồng ý.`,
  `(~40s) Dùng thế nào? Người dùng cài Payvoke bridge vào Claude, liên kết tài khoản và cấp hạn mức một lần.
Sau đó chỉ cần nói: làm giúp mình landing page cho quán cà phê Mộc.
[→] Claude tự tìm thấy agent của A.
[→] Lấy báo giá: 5 USDC, 30 phút.
[→] Hỏi người dùng có đồng ý chi không. Model không tự quyết.
[→] Đồng ý thì gửi việc, rồi lấy kết quả.
[→] Và trả về trang web. Phần MCP đang được hoàn thiện.`,
  `(~35s) Giờ nói về tiền, theo cách đơn giản nhất. Bình nạp 20 USDC vào PayvokeVault.
Khi Bình bấm Authorize, 5 USDC bị khoá lại riêng cho landing page đó.
Giao đúng hạn thì tiền mở ra cho A. Lỗi, trễ hay không giao thì về lại Bình. Quá hạn mà không ai xử lý, Bình tự rút lại.
Giống sàn thương mại điện tử giữ tiền đến khi nhận hàng, nhưng người giữ là smart contract, không phải công ty.`,
  `(~45s) Thanh toán chạy trên chuẩn x402. HTTP có mã 402 Payment Required từ những năm 90 nhưng chưa ai dùng. x402 biến nó thành cách trả tiền chuẩn.
Hình dung như máy bán nước: bấm nút, máy báo giá, đưa tiền, nhận nước. Nhưng tất cả nằm trong một request web.
Máy của Bình gọi /landing. Payvoke trả 402: cần 5 USDC. Máy của Bình gọi lại, kèm chữ ký thanh toán. Payvoke khoá tiền trong vault trên Avalanche, đợi chốt xong mới trả 200: đã nhận việc.
Vì là HTTP, cả người lẫn agent đều trả tiền được theo cùng một cách.`,
  `(~35s) Payvoke dùng x402 nhưng thêm lớp bảo vệ.
x402 thông thường chuyển tiền thẳng cho người bán: không giao thì khó đòi lại. Payvoke cho tiền vào vault, giao xong mới mở, không giao thì tự hoàn.
Chữ ký của Payvoke ghi rõ cả lần gọi, báo giá và input, nên không dùng lại cho việc khác được. Và thay vì mở ví mỗi lần, khoá phiên ký thay, trong hạn mức.`,
  `(~40s) Khoá phiên hoạt động thế này.
Một: máy của Bình tự tạo một khoá mới, khoá bí mật không rời máy.
Hai: ví chính ký đúng một lần, đăng ký khoá đó lên vault với hạn mức, ví dụ 5 USDC mỗi lần, 50 USDC mỗi tháng.
Ba: từ đó mỗi lần Authorize, khoá phiên ký, không phải bật ví. Vault kiểm tra đúng khoá, còn trong hạn mức.
Bốn: muốn dừng thì thu hồi, mọi chữ ký của khoá đó hết hiệu lực.
Khoá phiên không rút được tiền; lộ thì thiệt tối đa bằng hạn mức.`,
  `(~40s) Trước khi làm, chúng tôi đọc các nghiên cứu gần đây về bảo mật x402. Họ thử nhiều facilitator đang chạy và cái nào cũng dính lỗi.
Chúng tôi lấy những lỗi đó làm checklist: không báo thành công khi tiền chưa chốt, chữ ký không mở được việc khác, không trừ hai lần, không để chi vượt, và không giao việc trước khi giữ tiền.`,
  `(~40s) Nhóm lỗi thứ hai là bị lợi dụng.
Header thanh toán bị lộ cũng vô dụng vì chỉ relayer được uỷ quyền mới gửi được lên vault. Gas có trần và chỉ ký đúng một hàm. Header không chứa prompt hay dữ liệu khách.
Giá cố định theo phiên bản để không ai thổi phồng token ẩn. Và tiền chỉ được trả khi bằng chứng giao hàng đạt mức đã cam kết, không dựa vào lời provider tự khai.`,
  `(~45s) Câu hỏi tự nhiên tiếp theo là: vậy Payvoke có lấy được tiền của khách không? Câu trả lời là không, và điều đó nằm trong code của contract chứ không phải lời hứa.
Một: mỗi việc một khoá riêng. Khoá gửi giao dịch, khoá quyết định trả hay hoàn, khoá tạm dừng là các khoá khác nhau. Lỡ lộ khoá gửi giao dịch thì kẻ gian vẫn không có chữ ký của Bình, nên không khoá được đồng nào.
Hai: nút tạm dừng chỉ để xử lý sự cố, nó chặn các khoản thu mới, nhưng Bình vẫn rút số dư về ví bình thường.
Ba: không có cửa sau. Contract không có hàm nào cho phép lấy tiền trong số dư của khách, và cũng không thể âm thầm thay code. 5 USDC của Bình chỉ có ba đường đi: trả cho A, trả lại Bình, hoặc Bình tự rút.
Bốn: phí có trần ghi sẵn trong contract, và tỷ lệ phí được chốt ngay lúc Bình bấm Authorize nên không bị đổi giữa chừng. Muốn nâng trần phải chờ một khoảng thời gian, ai cũng kịp thấy trước.`,
  `(~15s) Tóm lại: bạn làm agent, Payvoke lo chuyện bán.
Cảm ơn ban giám khảo, chúng tôi sẵn sàng nghe câu hỏi.`,
];
