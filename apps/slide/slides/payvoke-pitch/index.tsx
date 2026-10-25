import type { ReactNode } from 'react';
import { Step, Steps, useSlidePageNumber } from '@open-slide/core';
import type { DesignSystem, Page, SlideMeta, SlideTransition } from '@open-slide/core';

/* ------------------------------------------------------------------ */
/* Fonts — injected once, keyed to this slide                          */
/* ------------------------------------------------------------------ */

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
const FONT_LINK_ID = 'osd-webfont-payvoke-pitch';

if (typeof document !== 'undefined') {
  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = FONT_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== FONT_HREF) link.href = FONT_HREF;
}

/* ------------------------------------------------------------------ */
/* Design system — Osaka Jade, daylight                                */
/* ------------------------------------------------------------------ */

export const design: DesignSystem = {
  palette: { bg: '#f4f7f5', text: '#182e24', accent: '#286346' },
  fonts: {
    display: '"Geist", system-ui, -apple-system, sans-serif',
    body: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
  typeScale: { hero: 168, body: 32 },
  radius: 0,
};

const deep = '#eaf0ec';
const surface = '#fcfdfc';
const raised = '#e2ebe5';
const hair = '#d3dfd7';
const edge = '#81968a';
const bodyText = '#465d50';
const muted = '#536b5d';
const onAccent = '#f8fbf9';
const brandSoft = '#dcebe1';
const warm = '#7c500b';
const gridLine = '#cfdfd5';

const fill = { width: '100%', height: '100%', boxSizing: 'border-box' } as const;
const display = { fontFamily: 'var(--osd-font-display)' } as const;
const mono = { fontFamily: 'var(--osd-font-body)' } as const;

const EASE_OUT = 'cubic-bezier(0, 0, 0.2, 1)';
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const HOLD: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

export const transition: SlideTransition = {
  duration: 240,
  exit: { duration: 240, easing: EASE_IN, keyframes: HOLD },
  enter: {
    duration: 240,
    easing: EASE_OUT,
    keyframes: [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
  },
};

/* ------------------------------------------------------------------ */
/* Shared chrome                                                       */
/* ------------------------------------------------------------------ */

const TopBar = ({ label }: { label: string }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 28,
      flexShrink: 0,
      fontSize: 19,
      letterSpacing: '0.18em',
      color: muted,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span style={{ width: 10, height: 10, background: 'var(--osd-accent)', display: 'block' }} />
      <span>PAYVOKE</span>
    </div>
    <span>{label}</span>
  </div>
);

const Footer = () => {
  const { current, total } = useSlidePageNumber();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 24,
        flexShrink: 0,
        fontSize: 18,
        letterSpacing: '0.14em',
        color: muted,
      }}
    >
      <span>AVALANCHE FUJI · USDC TESTNET</span>
      <span>
        {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
      </span>
    </div>
  );
};

const PageShell = ({ label, children }: { label: string; children: ReactNode }) => (
  <section
    style={{
      ...fill,
      background: 'var(--osd-bg)',
      color: 'var(--osd-text)',
      ...mono,
      padding: '100px 120px',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <TopBar label={label} />
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        paddingTop: 40,
        paddingBottom: 36,
      }}
    >
      {children}
    </div>
    <Footer />
  </section>
);

const Eyebrow = ({ children, color = 'var(--osd-accent)' }: { children: ReactNode; color?: string }) => (
  <div style={{ fontSize: 19, letterSpacing: '0.18em', color, marginBottom: 20 }}>{children}</div>
);

const H2 = ({ children, size = 76 }: { children: ReactNode; size?: number }) => (
  <h2
    style={{
      ...display,
      fontSize: size,
      lineHeight: 1.08,
      letterSpacing: '-0.035em',
      fontWeight: 600,
      margin: 0,
    }}
  >
    {children}
  </h2>
);

const Lead = ({ children }: { children: ReactNode }) => (
  <p style={{ fontSize: 29, lineHeight: 1.55, color: bodyText, margin: '20px 0 0', maxWidth: 1250 }}>
    {children}
  </p>
);

const Card = ({
  index,
  kicker,
  title,
  children,
}: {
  index: string;
  kicker: string;
  title: string;
  children: ReactNode;
}) => (
  <div style={{ borderTop: `1px solid ${hair}`, paddingTop: 24, display: 'flex', flexDirection: 'column' }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: 18,
        letterSpacing: '0.14em',
        color: muted,
      }}
    >
      <span>{index}</span>
      <span style={{ color: 'var(--osd-accent)' }}>{kicker}</span>
    </div>
    <h3
      style={{
        ...display,
        fontSize: 34,
        lineHeight: 1.25,
        letterSpacing: '-0.02em',
        fontWeight: 600,
        margin: '18px 0 0',
      }}
    >
      {title}
    </h3>
    <p style={{ fontSize: 26, lineHeight: 1.6, color: bodyText, margin: '16px 0 0' }}>{children}</p>
  </div>
);

const ClosingLine = ({ children }: { children: ReactNode }) => (
  <div
    style={{
      marginTop: 'auto',
      borderTop: `1px solid ${hair}`,
      paddingTop: 24,
      ...display,
      fontSize: 38,
      lineHeight: 1.25,
      letterSpacing: '-0.025em',
      color: 'var(--osd-text)',
    }}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* 01 — Cover                                                          */
/* ------------------------------------------------------------------ */

const AppRow = ({ name, cmd, price }: { name: string; cmd: string; price: string }) => (
  <div
    style={{
      padding: '20px 22px',
      borderBottom: `1px solid ${hair}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <div>
      <div style={{ ...display, fontSize: 25, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</div>
      <div style={{ fontSize: 18, color: muted, marginTop: 6 }}>{cmd}</div>
    </div>
    <div style={{ fontSize: 23, color: 'var(--osd-accent)' }}>
      {price}
      <span style={{ fontSize: 15, color: muted }}> USDC</span>
    </div>
  </div>
);

const Chip = ({ children, active = false }: { children: ReactNode; active?: boolean }) => (
  <span
    style={{
      border: `1px solid ${active ? 'var(--osd-accent)' : edge}`,
      background: active ? 'var(--osd-accent)' : 'transparent',
      color: active ? onAccent : bodyText,
      fontSize: 16,
      padding: '6px 10px',
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </span>
);

const Cover: Page = () => (
  <section
    style={{
      ...fill,
      position: 'relative',
      overflow: 'hidden',
      background: deep,
      color: 'var(--osd-text)',
      ...mono,
      padding: '100px 120px',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
        opacity: 0.8,
        pointerEvents: 'none',
      }}
    />
    <div
      aria-hidden="true"
      style={{ position: 'absolute', right: 0, top: 0, width: 8, height: '38%', background: 'var(--osd-accent)' }}
    />
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
      <TopBar label="PITCH / 2026" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 72, padding: '24px 0' }}>
        <div style={{ width: 1010 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              fontSize: 19,
              letterSpacing: '0.18em',
              color: 'var(--osd-accent)',
            }}
          >
            <span style={{ width: 12, height: 12, background: 'var(--osd-accent)', display: 'block' }} />
            MARKETPLACE CHO AI APPS
          </div>
          <h1
            style={{
              ...display,
              fontSize: 132,
              lineHeight: 1.02,
              letterSpacing: '-0.055em',
              fontWeight: 600,
              margin: '30px 0 0',
            }}
          >
            Chợ app AI.
            <br />
            <span style={{ color: 'var(--osd-accent)' }}>
              Trả tiền theo
              <br />
              lần gọi.
            </span>
          </h1>
          <p style={{ fontSize: 28, lineHeight: 1.55, color: bodyText, margin: '30px 0 0', maxWidth: 930 }}>
            Mỗi app là một thread chat với slash command. Quote trước, giữ tiền trong vault, giao kết quả
            rồi mới release.
          </p>
          <p style={{ ...display, fontSize: 29, fontStyle: 'italic', color: muted, margin: '22px 0 0' }}>
            “Apps worth sharing. Threads worth keeping.”
          </p>
        </div>

        <div style={{ width: 598, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ border: `1px solid ${edge}`, background: 'rgba(252, 253, 252, 0.92)' }}>
            <div
              style={{
                padding: '18px 22px',
                borderBottom: `1px solid ${hair}`,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 17,
                letterSpacing: '0.16em',
                color: muted,
              }}
            >
              <span>STORE / PUBLIC</span>
              <span>3 APPS</span>
            </div>
            <AppRow name="Market Brief" cmd="/research" price="0.10" />
            <AppRow name="Summarize" cmd="/summarize" price="0.01" />
            <AppRow name="Data Clean-up" cmd="/clean" price="0.05" />
            <div
              style={{
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 17,
                letterSpacing: '0.14em',
                color: muted,
              }}
            >
              <span>QUOTE → HOLD → RELEASE</span>
              <span style={{ color: 'var(--osd-accent)' }}>● LIVE</span>
            </div>
          </div>

          <div style={{ border: `1px solid ${edge}`, padding: '22px', background: surface }}>
            <div style={{ fontSize: 16, letterSpacing: '0.16em', color: muted }}>TRONG THREAD</div>
            <div style={{ ...display, fontSize: 24, lineHeight: 1.35, marginTop: 12 }}>
              “Bạn muốn tập trung thị trường nào?”
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <Chip active>Việt Nam</Chip>
              <Chip>Đông Nam Á</Chip>
              <Chip>Global</Chip>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  </section>
);

/* ------------------------------------------------------------------ */
/* 02 — Problem                                                        */
/* ------------------------------------------------------------------ */

const Problem: Page = () => (
  <PageShell label="VẤN ĐỀ / 01">
    <Eyebrow>BA VẤN ĐỀ, MỘT NGUYÊN NHÂN</Eyebrow>
    <H2 size={80}>
      AI app hay,
      <br />
      nhưng không ai bán lẻ được.
    </H2>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 56 }}>
      <Card index="01" kicker="SUBSCRIPTION" title="Trả cả tháng cho một việc dùng hai lần.">
        Một báo cáo, một lần clean data — nhưng vẫn phải trả cả tháng.
      </Card>
      <Card index="02" kicker="BUILDER" title="Builder có app, nhưng không có store.">
        Có app, nhưng thiếu store, payment rail và lớp giữ tiền.
      </Card>
      <Card index="03" kicker="TRUST" title="Trả trước cho output chưa thấy.">
        Không hold, không refund, không dispute. Provider tốt cũng không có cách chứng minh.
      </Card>
    </div>

    <ClosingLine>Thiếu một lớp trung gian giữ tiền — và giữ lời.</ClosingLine>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 03 — Why now                                                        */
/* ------------------------------------------------------------------ */

const WhyNow: Page = () => (
  <PageShell label="VÌ SAO BÂY GIỜ / 02">
    <Eyebrow>BA MẢNH GHÉP VỪA CHÍN</Eyebrow>
    <H2 size={84}>Ba mảnh ghép vừa chín.</H2>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 64 }}>
      <Card index="01" kicker="AI APPS" title="App AI đã vượt khỏi chatbot.">
        Nghiên cứu, viết, clean data, phân tích — mỗi việc là một app riêng.
      </Card>
      <Card index="02" kicker="x402" title="Thanh toán ngay ở lớp HTTP.">
        402 → ký → settle. Không tài khoản, không checkout rời.
      </Card>
      <Card index="03" kicker="USDC / AVALANCHE" title="Stablecoin đã đủ rẻ và nhanh.">
        Fuji testnet cho phép chứng minh luồng tiền trước mainnet.
      </Card>
    </div>

    <div style={{ marginTop: 'auto', borderTop: `1px solid ${hair}`, paddingTop: 22 }}>
      <div style={{ fontSize: 16, letterSpacing: '0.16em', color: muted, marginBottom: 14 }}>GHÉP LẠI</div>
      <div
        style={{
          ...display,
          display: 'flex',
          alignItems: 'baseline',
          gap: 18,
          fontSize: 42,
          letterSpacing: '-0.03em',
          fontWeight: 500,
        }}
      >
        <span>AI APPS</span>
        <span style={{ color: 'var(--osd-accent)' }}>×</span>
        <span>x402</span>
        <span style={{ color: 'var(--osd-accent)' }}>×</span>
        <span>USDC</span>
        <span style={{ color: 'var(--osd-accent)' }}>→</span>
        <span style={{ color: 'var(--osd-accent)' }}>PAYVOKE</span>
      </div>
      <div style={{ fontSize: 24, color: bodyText, marginTop: 14 }}>
        Điều còn thiếu: lớp ghép ba mảnh này lại.
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 04 — Solution                                                       */
/* ------------------------------------------------------------------ */

const Solution: Page = () => (
  <PageShell label="GIẢI PHÁP / 03">
    <Eyebrow>MỘT SẢN PHẨM, BA LỚP</Eyebrow>
    <H2 size={80}>
      Một store. Một thread.
      <br />
      Một lần trả tiền.
    </H2>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 52 }}>
      <Card index="[ STORE ]" kicker="KHÁM PHÁ" title="App public, giá công khai.">
        Xem command, giá và availability trước khi mở thread.
      </Card>
      <Card index="[ THREAD ]" kicker="SỬ DỤNG" title="Mọi app, một giao diện chat.">
        Slash command, A2UI hỏi lại và lịch sử invocation trong cùng một chỗ.
      </Card>
      <Card index="[ VAULT ]" kicker="THANH TOÁN" title="Quote, hold, rồi mới release.">
        Tiền chỉ chuyển cho provider khi công việc đã xong.
      </Card>
    </div>

    <div style={{ marginTop: 'auto' }}>
      <div style={{ fontSize: 17, letterSpacing: '0.16em', color: muted, marginBottom: 12 }}>
        BẮT ĐẦU TỪ MỘT CÂU LỆNH
      </div>
      <div
        style={{
          border: `1px solid ${hair}`,
          background: surface,
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 28, color: bodyText }}>
          <span style={{ color: 'var(--osd-accent)' }}>{'>'}</span> /research “phân tích đối thủ của sản
          phẩm này”
        </span>
        <span style={{ fontSize: 22, color: muted }}>↵</span>
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 05 — Product flow                                                   */
/* ------------------------------------------------------------------ */

const StepRow = ({ n, title, body }: { n: string; title: string; body: string }) => (
  <div style={{ display: 'flex', gap: 22, padding: '12px 0', borderBottom: `1px solid ${hair}` }}>
    <div style={{ width: 40, flexShrink: 0, fontSize: 18, color: 'var(--osd-accent)', paddingTop: 5 }}>{n}</div>
    <div>
      <div style={{ ...display, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</div>
      <div style={{ fontSize: 22, color: muted, marginTop: 5, lineHeight: 1.45 }}>{body}</div>
    </div>
  </div>
);

const Bubble = ({ children, mine = false }: { children: ReactNode; mine?: boolean }) => (
  <div
    style={{
      alignSelf: mine ? 'flex-end' : 'flex-start',
      maxWidth: 660,
      border: `1px solid ${edge}`,
      background: mine ? raised : 'transparent',
      padding: '9px 13px',
      fontSize: 19,
      lineHeight: 1.45,
      color: mine ? bodyText : 'var(--osd-text)',
    }}
  >
    {children}
  </div>
);

const ThreadMock = () => (
  <div style={{ border: `1px solid ${edge}`, background: surface, height: 600, display: 'flex', flexDirection: 'column' }}>
    <div style={{ padding: '14px 20px', borderBottom: `1px solid ${hair}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ ...display, fontSize: 23, fontWeight: 600, letterSpacing: '-0.01em' }}>MARKET BRIEF</span>
        <span style={{ fontSize: 15, color: 'var(--osd-accent)', letterSpacing: '0.12em' }}>● AVAILABLE</span>
      </div>
      <div style={{ fontSize: 15, color: muted, marginTop: 6 }}>/research · 0.10 USDC · revision 7</div>
    </div>

    <div
      style={{
        flex: 1,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        justifyContent: 'center',
      }}
    >
      <Bubble mine>/research Phân tích đối thủ của sản phẩm này.</Bubble>

      <div style={{ alignSelf: 'flex-start', maxWidth: 660 }}>
        <div style={{ fontSize: 19, lineHeight: 1.45 }}>Bạn muốn tập trung thị trường nào?</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Chip active>Việt Nam</Chip>
          <Chip>Đông Nam Á</Chip>
          <Chip>Global</Chip>
        </div>
      </div>

      <Bubble mine>Việt Nam</Bubble>

      <div style={{ border: `1px solid var(--osd-accent)`, background: brandSoft, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, letterSpacing: '0.16em', color: 'var(--osd-accent)' }}>QUOTE</span>
          <span style={{ fontSize: 21, color: 'var(--osd-text)' }}>0.10 USDC</span>
        </div>
        <div style={{ fontSize: 15, color: muted, marginTop: 6 }}>
          Market Brief / /research / 90 giây
        </div>
        <div
          style={{
            marginTop: 10,
            background: 'var(--osd-accent)',
            color: onAccent,
            fontSize: 16,
            fontWeight: 600,
            letterSpacing: '0.08em',
            padding: '8px 12px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>AUTHORIZE</span>
          <span>→</span>
        </div>
      </div>

      <div style={{ borderLeft: '3px solid var(--osd-accent)', paddingLeft: 12 }}>
        <div style={{ fontSize: 19 }}>Báo cáo 12 trang</div>
        <div style={{ fontSize: 14, color: 'var(--osd-accent)', marginTop: 4, letterSpacing: '0.1em' }}>
          ✓ VERIFIED · 2 NGUỒN
        </div>
      </div>
    </div>

    <div style={{ borderTop: `1px solid ${hair}`, padding: '9px 20px', fontSize: 14, color: muted }}>
      DELIVERED · tiền vẫn đang held tới hết review
    </div>
  </div>
);

const Product: Page = () => (
  <PageShell label="SẢN PHẨM / 04">
    <H2 size={80}>Một lần gọi, năm bước.</H2>

    <div style={{ display: 'flex', gap: 60, marginTop: 44, flex: 1, minHeight: 0 }}>
      <div style={{ width: 720, display: 'flex', flexDirection: 'column' }}>
        <StepRow n="01" title="Chọn app" body="Store hiển thị command, giá, availability." />
        <StepRow n="02" title="Gõ lệnh" body="/research … hoặc free text vào default command." />
        <StepRow n="03" title="Trả lời" body="A2UI hỏi lại ngay trong thread." />
        <StepRow n="04" title="Quote" body="Giá, input, deadline đóng băng trước khi ký." />
        <StepRow n="05" title="Nhận kết quả" body="Chỉ bản đã verify mới được DELIVERED." />
      </div>

      <div style={{ width: 900 }}>
        <ThreadMock />
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 06 — How payment works                                              */
/* ------------------------------------------------------------------ */

const Node = ({
  n,
  title,
  detail,
  hot = false,
}: {
  n: string;
  title: string;
  detail: string;
  hot?: boolean;
}) => (
  <div
    style={{
      width: 250,
      height: 200,
      borderTop: `3px solid ${hot ? 'var(--osd-accent)' : hair}`,
      background: hot ? 'var(--osd-accent)' : surface,
      color: hot ? onAccent : 'var(--osd-text)',
      padding: '22px 20px',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <div style={{ fontSize: 16, letterSpacing: '0.14em', color: hot ? 'rgba(248,251,249,0.7)' : muted }}>{n}</div>
    <div style={{ ...display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 10 }}>{title}</div>
    <div style={{ fontSize: 21, lineHeight: 1.45, color: hot ? 'rgba(248,251,249,0.85)' : bodyText, marginTop: 14 }}>
      {detail}
    </div>
  </div>
);

const Arrow = () => (
  <div style={{ width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', color: muted, fontSize: 24 }}>
    →
  </div>
);

const Principle = ({ n, children }: { n: string; children: ReactNode }) => (
  <div>
    <div style={{ fontSize: 15, letterSpacing: '0.14em', color: 'var(--osd-accent)' }}>NGUYÊN TẮC {n}</div>
    <div style={{ fontSize: 26, lineHeight: 1.5, color: bodyText, marginTop: 10 }}>{children}</div>
  </div>
);

const Payment: Page = () => (
  <PageShell label="CÁCH HOẠT ĐỘNG / 05">
    <H2 size={84}>Tiền chỉ chạy khi có việc.</H2>

    <div style={{ display: 'flex', alignItems: 'stretch', marginTop: 54 }}>
      <Steps>
        <Step>
          <div style={{ display: 'flex' }}>
            <Node n="01" title="BUYER" detail="POST /v1/invocations" />
          </div>
        </Step>
        <Step>
          <div style={{ display: 'flex' }}>
            <Arrow />
            <Node n="02" title="API" detail="402 + PAYMENT-REQUIRED" />
          </div>
        </Step>
        <Step>
          <div style={{ display: 'flex' }}>
            <Arrow />
            <Node n="03" title="CLIENT" detail="ký DebitAuthorization" />
          </div>
        </Step>
        <Step>
          <div style={{ display: 'flex' }}>
            <Arrow />
            <Node n="04" title="VAULT" detail="reserveHold onchain" hot />
          </div>
        </Step>
        <Step>
          <div style={{ display: 'flex' }}>
            <Arrow />
            <Node n="05" title="PROVIDER" detail="SSE → AG-UI / A2UI" />
          </div>
        </Step>
        <Step>
          <div style={{ display: 'flex' }}>
            <Arrow />
            <Node n="06" title="SETTLE" detail="release / refund" />
          </div>
        </Step>
      </Steps>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 54 }}>
      <Principle n="01">giao việc trước khi hold được xác nhận.</Principle>
      <Principle n="02">release trước khi kết quả được verify.</Principle>
      <Principle n="03">fallback sang chain khác hay facilitator lạ.</Principle>
    </div>

    <div style={{ marginTop: 40, fontSize: 22, color: muted }}>
      Một invocation chỉ reserve một lần. Release là terminal — không chạy lại.
    </div>

    <div
      style={{
        marginTop: 'auto',
        borderTop: `1px solid ${hair}`,
        borderBottom: `1px solid ${hair}`,
        padding: '16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        fontSize: 22,
        color: bodyText,
      }}
    >
      <span style={{ fontSize: 15, letterSpacing: '0.14em', color: muted }}>PAYMENT STATE</span>
      <span>UNPAID</span>
      <span style={{ color: 'var(--osd-accent)' }}>→</span>
      <span style={{ color: 'var(--osd-accent)' }}>HELD</span>
      <span style={{ color: 'var(--osd-accent)' }}>→</span>
      <span>RELEASED / REFUNDED / RECLAIMED</span>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 07 — Trust layer                                                    */
/* ------------------------------------------------------------------ */

const Trust: Page = () => (
  <PageShell label="LỚP TIN CẬY / 06">
    <Eyebrow>ESCROW, KHÔNG PHẢI CHUYỂN KHOẢN</Eyebrow>
    <H2 size={80}>
      Không phải chuyển khoản.
      <br />
      Là escrow có luật.
    </H2>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 52 }}>
      <Card index="01" kicker="GRANT" title="Hạn mức chi có hạn.">
        Mỗi lần, mỗi kỳ, tổng cộng và ngày hết hạn. Client giữ khóa; ví chính không rời tay.
      </Card>
      <Card index="02" kicker="HOLD" title="Một hold cho một việc.">
        Quá resolveBy mà chưa xử lý, buyer reclaim được.
      </Card>
      <Card index="03" kicker="DISPUTE" title="Không admin nào rút hộ.">
        Approver và executor dùng khóa riêng; mọi quyết định idempotent.
      </Card>
    </div>

    <div style={{ marginTop: 'auto', borderTop: `1px solid ${hair}`, paddingTop: 20 }}>
      <div style={{ fontSize: 15, letterSpacing: '0.16em', color: muted, marginBottom: 10 }}>
        BẤT BIẾN KẾ TOÁN / KIỂM TRA ONCHAIN
      </div>
      <div style={{ fontSize: 23, lineHeight: 1.55, color: bodyText }}>
        tokenBalance ≥ buyerAvailable + heldRemaining
        <br />
        + providerClaimable + platformClaimable
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 08 — Provider                                                       */
/* ------------------------------------------------------------------ */

const ProviderItem = ({ n, title, body }: { n: string; title: string; body: string }) => (
  <div style={{ borderTop: `1px solid ${hair}`, paddingTop: 16 }}>
    <div style={{ display: 'flex', gap: 18 }}>
      <span style={{ fontSize: 16, color: 'var(--osd-accent)', paddingTop: 4 }}>{n}</span>
      <div>
        <div style={{ ...display, fontSize: 29, fontWeight: 600, letterSpacing: '-0.02em' }}>{title}</div>
        <div style={{ fontSize: 22, color: muted, marginTop: 6, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  </div>
);

const Provider: Page = () => (
  <PageShell label="PROVIDER / 07">
    <H2 size={80}>
      Provider tự chạy app.
      <br />
      Payvoke giữ luật.
    </H2>

    <div style={{ display: 'flex', gap: 96, marginTop: 44, flex: 1, minHeight: 0 }}>
      <div style={{ width: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ProviderItem n="01" title="Studio self-serve" body="Tạo app, set visibility, payout, default command." />
        <ProviderItem n="02" title="Revision bất biến" body="Sửa giá hay schema tạo revision mới; quote cũ không đổi." />
        <ProviderItem n="03" title="SSE, không webhook" body="Provider mở kết nối tới Payvoke, tự chia job cho worker." />
        <ProviderItem n="04" title="Một API key mỗi app" body="Tạo key mới thu hồi key cũ ngay. Secret chỉ hiện một lần." />
      </div>

      <div style={{ width: 824 }}>
        <div style={{ border: `1px solid ${edge}`, background: deep }}>
          <div
            style={{
              padding: '12px 18px',
              borderBottom: `1px solid ${hair}`,
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 15,
              letterSpacing: '0.14em',
              color: muted,
            }}
          >
            <span>PROVIDER WORKER / MARKET BRIEF</span>
            <span style={{ color: 'var(--osd-accent)' }}>● CONNECTED</span>
          </div>
          <div style={{ padding: '22px 24px', fontSize: 22, lineHeight: 1.85, color: bodyText }}>
            <div>
              <span style={{ color: 'var(--osd-accent)' }}>$</span> payvoke app create “Market Brief”
            </div>
            <div style={{ color: 'var(--osd-accent)' }}>✓ app created · payout 0x7f…a2</div>
            <div style={{ height: 10 }} />
            <div>
              <span style={{ color: 'var(--osd-accent)' }}>$</span> payvoke command add /research \
            </div>
            <div style={{ paddingLeft: 28 }}>--price 0.10 --delivery 90s</div>
            <div style={{ color: 'var(--osd-accent)' }}>✓ revision 7 pinned</div>
            <div style={{ height: 10 }} />
            <div>
              <span style={{ color: 'var(--osd-accent)' }}>$</span> payvoke listen
            </div>
            <div style={{ color: 'var(--osd-accent)' }}>● awaiting invocation.ready</div>
          </div>
        </div>
        <div style={{ fontSize: 16, letterSpacing: '0.14em', color: muted, marginTop: 14 }}>
          MỘT APP · MỘT KEY · HEARTBEAT 45 GIÂY
        </div>
        <div style={{ marginTop: 22, border: `1px solid ${hair}`, background: surface, padding: '16px 18px' }}>
          <div style={{ fontSize: 14, letterSpacing: '0.16em', color: muted }}>SSE EVENTS</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 17, color: bodyText, flexWrap: 'wrap' }}>
            <span>invocation.ready</span>
            <span>invocation.answer</span>
            <span>revision_requested</span>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 09 — Business model                                                 */
/* ------------------------------------------------------------------ */

const Business: Page = () => (
  <PageShell label="MÔ HÌNH KINH DOANH / 08">
    <H2 size={84}>Take rate trên việc đã xong.</H2>
    <Lead>
      Buyer trả một giá gộp. Provider nhận net sau refund. Payvoke chỉ lấy phí trên phần đã settle.
    </Lead>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 44 }}>
      <Card index="01" kicker="BUYER" title="Một giá, không phí ẩn.">
        Thấy giá trước khi ký; trả đúng một lần cho một việc.
      </Card>
      <Card index="02" kicker="PROVIDER" title="Nhận phần còn lại.">
        Tiền vào claimable, provider tự rút về payout address.
      </Card>
      <Card index="03" kicker="PAYVOKE" title="Chỉ ăn trên việc đã xong.">
        Không thu trên job chưa giao; refund làm giảm phí.
      </Card>
    </div>

    <div style={{ marginTop: 48, display: 'flex', alignItems: 'baseline', gap: 18, ...display }}>
      <span style={{ fontSize: 16, letterSpacing: '0.16em', color: muted }}>DOANH THU</span>
      <span style={{ fontSize: 40 }}>=</span>
      <span style={{ fontSize: 40, color: 'var(--osd-accent)' }}>feeBps</span>
      <span style={{ fontSize: 40 }}>×</span>
      <span style={{ fontSize: 40 }}>GMV đã settle</span>
    </div>

    <div
      style={{
        marginTop: 'auto',
        border: `1px solid ${hair}`,
        background: surface,
        padding: '24px 30px',
      }}
    >
      <div style={{ fontSize: 15, letterSpacing: '0.16em', color: muted }}>
        VÍ DỤ MINH HOẠ · TỶ LỆ PHÍ CHƯA CHỐT
      </div>
      <div style={{ fontSize: 25, color: bodyText, marginTop: 14 }}>gross 1.00 − refund 0.20 = net 0.80</div>
      <div style={{ fontSize: 25, color: 'var(--osd-accent)', marginTop: 8 }}>
        fee = floor(net × feeBps / 10_000) → provider = net − fee
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 10 — Competition                                                    */
/* ------------------------------------------------------------------ */

const Mark = ({ value }: { value: 'yes' | 'part' | 'no' }) => (
  <span
    style={{
      fontSize: 28,
      color: value === 'yes' ? 'var(--osd-accent)' : value === 'part' ? warm : muted,
    }}
  >
    {value === 'yes' ? '✓' : value === 'part' ? '~' : '—'}
  </span>
);

const TableRow = ({
  name,
  store,
  chat,
  call,
  escrow,
  highlight = false,
}: {
  name: string;
  store: 'yes' | 'part' | 'no';
  chat: 'yes' | 'part' | 'no';
  call: 'yes' | 'part' | 'no';
  escrow: 'yes' | 'part' | 'no';
  highlight?: boolean;
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '400px repeat(4, 1fr)',
      alignItems: 'center',
      height: 76,
      borderTop: `1px solid ${highlight ? 'var(--osd-accent)' : hair}`,
      background: highlight ? brandSoft : 'transparent',
      padding: '0 20px',
    }}
  >
    <span
      style={{
        ...display,
        fontSize: 27,
        fontWeight: highlight ? 600 : 500,
        color: highlight ? 'var(--osd-text)' : bodyText,
      }}
    >
      {name}
    </span>
    <span style={{ textAlign: 'center' }}>
      <Mark value={store} />
    </span>
    <span style={{ textAlign: 'center' }}>
      <Mark value={chat} />
    </span>
    <span style={{ textAlign: 'center' }}>
      <Mark value={call} />
    </span>
    <span style={{ textAlign: 'center' }}>
      <Mark value={escrow} />
    </span>
  </div>
);

const Competition: Page = () => (
  <PageShell label="CẠNH TRANH / 09">
    <H2 size={72}>
      Không phải GPT Store.
      <br />
      Không phải RapidAPI.
    </H2>

    <div style={{ marginTop: 44 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '400px repeat(4, 1fr)',
          padding: '0 20px 14px',
          fontSize: 15,
          letterSpacing: '0.16em',
          color: muted,
        }}
      >
        <span>SO SÁNH</span>
        <span style={{ textAlign: 'center' }}>STORE</span>
        <span style={{ textAlign: 'center' }}>CHAT</span>
        <span style={{ textAlign: 'center' }}>PER-CALL</span>
        <span style={{ textAlign: 'center' }}>ESCROW</span>
      </div>
      <TableRow name="GPT Store" store="yes" chat="yes" call="no" escrow="no" />
      <TableRow name="RapidAPI" store="yes" chat="no" call="part" escrow="no" />
      <TableRow name="x402 thuần" store="no" chat="no" call="yes" escrow="no" />
      <TableRow name="Payvoke" store="yes" chat="yes" call="yes" escrow="yes" highlight />
    </div>

    <div style={{ marginTop: 14, fontSize: 16, color: muted, letterSpacing: '0.08em' }}>
      ✓ có · ~ một phần, phải tự dựng · — không có
    </div>

    <div
      style={{
        marginTop: 'auto',
        borderTop: `1px solid ${hair}`,
        paddingTop: 24,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 48,
      }}
    >
      <div style={{ ...display, fontSize: 42, letterSpacing: '-0.03em', fontWeight: 500 }}>
        Store + chat + escrow.
      </div>
      <div style={{ fontSize: 20, color: bodyText, textAlign: 'right', maxWidth: 620 }}>
        Mỗi mảnh đã có người làm. Chưa ai ghép đúng.
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 11 — Status                                                         */
/* ------------------------------------------------------------------ */

const StatusColumn = ({
  kicker,
  color,
  items,
}: {
  kicker: string;
  color: string;
  items: string[];
}) => (
  <div>
    <div style={{ borderTop: `3px solid ${color}`, paddingTop: 16 }}>
      <div style={{ fontSize: 18, letterSpacing: '0.16em', color }}>{kicker}</div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 18, fontSize: 25, color: bodyText }}>
      <div>{items[0]}</div>
      <div>{items[1]}</div>
      <div>{items[2]}</div>
      {items[3] ? <div>{items[3]}</div> : null}
    </div>
  </div>
);

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
    <span style={{ ...display, fontSize: 42, fontWeight: 600, letterSpacing: '-0.03em' }}>{value}</span>
    <span style={{ fontSize: 16, letterSpacing: '0.12em', color: muted }}>{label}</span>
  </div>
);

const Gate = ({ n, name, status, color }: { n: string; name: string; status: string; color: string }) => (
  <div
    style={{
      borderTop: `2px solid ${color}`,
      background: surface,
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: 12,
    }}
  >
    <span style={{ fontSize: 15, color: muted }}>{n}</span>
    <span style={{ ...display, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>{name}</span>
    <span style={{ fontSize: 14, letterSpacing: '0.12em', color }}>{status}</span>
  </div>
);

const Status: Page = () => (
  <PageShell label="TRẠNG THÁI / 10">
    <H2 size={80}>Hôm nay, chạy được đến đâu?</H2>

    <div
      style={{
        display: 'flex',
        gap: 56,
        marginTop: 28,
        paddingBottom: 24,
        borderBottom: `1px solid ${hair}`,
      }}
    >
      <Stat value="61" label="PRISMA MODELS" />
      <Stat value="4" label="SPECS" />
      <Stat value="10" label="MODULES" />
      <Stat value="134" label="ROADMAP TASKS" />
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 32 }}>
      <StatusColumn
        kicker="✓ ĐÃ CÓ"
        color="var(--osd-accent)"
        items={['Store, chat, Studio nối API', 'AG-UI + A2UI streaming', 'Quote + command revision', 'Prisma schema validated']}
      />
      <StatusColumn
        kicker="→ ĐANG XÂY"
        color={warm}
        items={['PayvokeVault contract', 'x402 facilitator adapters', 'MCP bridge local', 'Dispute & operations']}
      />
      <StatusColumn
        kicker="— CHƯA CÓ"
        color={muted}
        items={['Fuji E2E với ví thật', 'Audit contract', 'Mainnet / tiền thật', '']}
      />
    </div>

    <div style={{ marginTop: 'auto', borderTop: `1px solid ${hair}`, paddingTop: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <span style={{ fontSize: 15, letterSpacing: '0.16em', color: muted }}>GATE TRƯỚC MAINNET</span>
        <span style={{ fontSize: 15, letterSpacing: '0.1em', color: muted }}>TESTNET · KHÔNG PHẢI TIỀN THẬT</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Gate n="01" name="FUJI E2E" status="TIẾP THEO" color={warm} />
        <Gate n="02" name="AUDIT" status="SAU ĐÓ" color={muted} />
        <Gate n="03" name="MAINNET" status="SAU ĐÓ" color={muted} />
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* 12 — Ask                                                            */
/* ------------------------------------------------------------------ */

const Ask = ({ n, title, body }: { n: string; title: string; body: string }) => (
  <div style={{ borderTop: `1px solid ${hair}`, paddingTop: 20 }}>
    <div style={{ ...display, fontSize: 56, lineHeight: 1, color: 'var(--osd-accent)', letterSpacing: '-0.04em' }}>{n}</div>
    <div style={{ ...display, fontSize: 31, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 18 }}>{title}</div>
    <div style={{ fontSize: 23, lineHeight: 1.5, color: muted, marginTop: 10 }}>{body}</div>
  </div>
);

const Closing: Page = () => (
  <PageShell label="ASK / 11">
    <Eyebrow>BƯỚC TIẾP THEO</Eyebrow>
    <H2 size={80}>
      Cần gì để thành
      <br />
      marketplace thật.
    </H2>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 48, marginTop: 48 }}>
      <Ask n="01" title="3–5 provider pilot" body="Đưa app thật lên store và chạy một tuần." />
      <Ask n="02" title="Fuji E2E + audit" body="Ví thật, USDC testnet, hold → release trọn luồng." />
      <Ask n="03" title="10 buyer design partner" body="Dùng thật, trả tiền thật, phản hồi hàng tuần." />
    </div>

    <div
      style={{
        marginTop: 'auto',
        borderTop: `1px solid ${hair}`,
        paddingTop: 26,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div style={{ ...display, fontSize: 56, fontWeight: 600, letterSpacing: '-0.045em' }}>PAYVOKE</div>
        <div style={{ fontSize: 21, color: muted, marginTop: 8 }}>
          Apps worth sharing. Threads worth keeping.
        </div>
      </div>
      <div style={{ ...display, fontSize: 38, color: 'var(--osd-accent)', letterSpacing: '-0.02em' }}>
        {'Q&A →'}
      </div>
    </div>
  </PageShell>
);

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

export const meta: SlideMeta = {
  title: 'Payvoke',
  createdAt: '2026-10-25T01:31:28.484Z',
};

export const notes: (string | undefined)[] = [
  'Mở bằng một tình huống rất cụ thể: buyer chỉ cần một báo cáo, một lần clean data, nhưng phải trả cả tháng subscription. Payvoke biến app AI thành thứ mua lẻ được — theo từng lần gọi. Nhấn mạnh: đây là testnet, không phải mainnet.',
  'Ba vấn đề này thực ra là một: thiếu lớp trung gian giữ tiền. Buyer không dám trả trước, builder không có rail để thu tiền, và app hay bị kẹt trong subscription. Câu chốt: thiếu một lớp giữ tiền — và giữ lời.',
  'Giải thích vì sao bây giờ: AI app đã nhiều và đa dạng; x402 vừa đủ chín để thanh toán ở lớp HTTP; stablecoin trên Avalanche đã rẻ và nhanh. Ba mảnh đã có, chưa ai ghép lại cho đúng use case mua lẻ.',
  'Chốt định vị trong một câu: store + thread + vault. Store để khám phá, thread để dùng, vault để tin. Đừng sa vào chi tiết kỹ thuật ở trang này — để dành sang phần sau.',
  'Đây là trang demo. Nếu có bản chạy live, chuyển sang demo ngay sau trang này. Nếu không, đi qua năm bước và chỉ vào mock thread: một câu lệnh, một câu hỏi làm rõ, một quote, một kết quả verified.',
  'Đi chậm ở bước 402 → ký → hold. Nhấn mạnh: provider chỉ nhận job sau khi hold được xác nhận, và chỉ được release sau khi kết quả verify. Ba chữ “KHÔNG” ở dưới là ba lỗi phổ biến của marketplace.',
  'Đây là phần khiến buyer dám trả tiền: grant có hạn mức, hold theo từng invocation, và dispute có approver/executor tách quyền. Câu bất biến kế toán là bằng chứng kỹ thuật — đọc chậm, đừng giảng giải quá lâu.',
  'Provider không phải chuyển code lên Payvoke. Họ tạo app trong Studio, giữ payout address, mở SSE để nhận việc. Revision bất biến nghĩa là sửa giá không làm hỏng quote cũ — đây là điểm bán cho provider.',
  'Mô hình doanh thu rất đơn giản: take rate trên net đã settle. Buyer thấy một giá gộp, provider nhận phần còn lại. Nói rõ tỷ lệ phí chưa chốt — đừng để judge nghĩ con số 5% là cam kết.',
  'So sánh để định vị, không phải để nói đối thủ dở. GPT Store mạnh distribution nhưng không có per-call payment và escrow. RapidAPI mạnh API nhưng không chat-native. x402 là rail, không phải marketplace. Payvoke ghép cả ba.',
  'Trung thực về trạng thái: demo provider → AG-UI/A2UI → buyer đã chạy; vault và x402 mới ở mức contract/spec; Fuji E2E với ví thật chưa có. Nói rõ đây là testnet. Sự trung thực này tăng độ tin cậy, không làm giảm điểm.',
  'Ask rõ ba việc: provider pilot, Fuji E2E + audit, buyer design partner. Kết bằng tagline và mời Q&A. Nếu ban giám khảo hỏi về mainnet, trả lời: mainnet chỉ sau audit và E2E ổn định.',
];

export default [
  Cover,
  Problem,
  WhyNow,
  Solution,
  Product,
  Payment,
  Trust,
  Provider,
  Business,
  Competition,
  Status,
  Closing,
] satisfies Page[];
