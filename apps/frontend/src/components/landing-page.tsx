"use client";

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Code2,
  Cpu,
  Database,
  FileSearch,
  Fingerprint,
  Layers3,
  LockKeyhole,
  Menu,
  Radio,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import { ParticleTextEffect } from "@/src/components/ui/interactive-text-particle";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { WalletAccess } from "@/src/components/wallet-access";

const agents = [
  {
    index: "01",
    initials: "DR",
    name: "Deep Research",
    kind: "RESEARCH AGENT",
    summary: "Go from a question to a structured report.",
    price: "$0.25",
    icon: FileSearch,
  },
  {
    index: "02",
    initials: "EX",
    name: "Data Extractor",
    kind: "DATA TOOL",
    summary: "Turn unstructured sources into clean data.",
    price: "$0.08",
    icon: Database,
  },
  {
    index: "03",
    initials: "CR",
    name: "Code Reviewer",
    kind: "DEVELOPER AGENT",
    summary: "Inspect code and surface actionable findings.",
    price: "$0.15",
    icon: Code2,
  },
];

const steps = [
  {
    number: "01",
    label: "DISCOVER",
    title: "Find your agent.",
    body: "Choose an agent or tool and review its commands, inputs, and price per run.",
  },
  {
    number: "02",
    label: "AUTHORIZE",
    title: "Approve the cost.",
    body: "See the inputs and final quote before authorizing a USDC hold.",
  },
  {
    number: "03",
    label: "EXECUTE",
    title: "Let it run.",
    body: "The provider runs the work on its own infrastructure and returns the result.",
  },
  {
    number: "04",
    label: "SETTLE",
    title: "Keep a record.",
    body: "Review the delivery and follow the hold, settlement, or refund status.",
  },
];

const providerFlow = [
  {
    number: "01",
    title: "Publish a product",
    description: "Register your tool, its commands, and the price of each run.",
  },
  {
    number: "02",
    title: "Listen for jobs",
    description: "Receive invocation events through the planned provider SSE feed.",
  },
  {
    number: "03",
    title: "Acknowledge and run",
    description: "Acknowledge the job, handle retries, and execute it on your servers.",
  },
  {
    number: "04",
    title: "Report the result",
    description: "Submit delivery status and output through the provider API.",
  },
];

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? "brand-mark brand-mark-small" : "brand-mark"} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

function Eyebrow({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <p className="section-eyebrow">
      <span className="section-index">{index}</span>
      {children}
    </p>
  );
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: reduced ? 0 : 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function SiteHeader() {
  const [menu, setMenu] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner page-container">
        <Link to="/" className="brand" aria-label="Payvoke home">
          <Mark />
          <span className="brand-word">
            payvoke<span className="brand-period">.</span>
          </span>
          <span className="brand-divider" />
          <span className="brand-tag">AGENTS / TOOLS / USDC</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="/#overview">Overview</a>
          <a href="/#marketplace">Marketplace</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#providers">Providers</a>
        </nav>
        <div className="header-actions">
          <span className="network-status">
            <span className="status-pulse" /> FUJI TESTNET
          </span>
          <WalletAccess />
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menu ? "Close menu" : "Open menu"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </div>
      {menu && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <a href="/#overview" onClick={() => setMenu(false)}>
            Overview <ArrowUpRight size={15} />
          </a>
          <a href="/#marketplace" onClick={() => setMenu(false)}>
            Marketplace <ArrowUpRight size={15} />
          </a>
          <a href="/#how-it-works" onClick={() => setMenu(false)}>
            How it works <ArrowUpRight size={15} />
          </a>
          <a href="/#providers" onClick={() => setMenu(false)}>
            Providers <ArrowUpRight size={15} />
          </a>
        </nav>
      )}
    </header>
  );
}

function Showcase() {
  return (
    <div className="showcase-frame">
      <div className="showcase-bar">
        <div className="showcase-dots">
          <span />
          <span />
          <span />
        </div>
        <span>payvoke / explore</span>
        <span className="showcase-bar-end">
          PREVIEW MODE <span className="live-star">✳</span>
        </span>
      </div>
      <div className="showcase-content">
        <div className="showcase-heading">
          <span className="showcase-kicker">MARKETPLACE / 001</span>
          <div className="showcase-heading-row">
            <h3>
              Agents and tools,
              <br />
              <em>priced per run.</em>
            </h3>
            <span className="market-symbol">
              <Cpu size={29} strokeWidth={1.1} />
            </span>
          </div>
          <p>Sample listings with indicative prices.</p>
        </div>
        <div className="showcase-tabs">
          <span className="tab-active">
            ALL AGENTS <small>03</small>
          </span>
          <span>TOOLS</span>
          <span>AGENTS</span>
          <span className="showcase-filter">
            FILTER <span>+</span>
          </span>
        </div>
        <div className="showcase-list">
          {agents.map(({ index, name, kind, price, icon: Icon }) => (
            <div className="showcase-item" key={index}>
              <div className="showcase-item-icon">
                <Icon size={21} strokeWidth={1.4} />
              </div>
              <div className="showcase-item-copy">
                <strong>{name}</strong>
                <span>{kind}</span>
              </div>
              <div className="showcase-item-price">
                <span>
                  {price} <small>/ RUN</small>
                </span>
                <ArrowUpRight size={16} />
              </div>
            </div>
          ))}
        </div>
        <div className="showcase-bottom">
          <div>ILLUSTRATIVE LISTINGS / NOT LIVE</div>
          <span>001 / 003</span>
        </div>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <HeroPixelField />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="page-container hero-main">
        <div className="hero-copy">
          <div className="hero-badge">
            <span className="badge-square" /> BUILDING ON AVALANCHE FUJI
          </div>
          <div className="particle-wordmark" aria-label="Payvoke">
            <span className="hero-wordmark-fallback" aria-hidden="true">
              PAYVOKE
            </span>
            <ParticleTextEffect text="PAYVOKE" className="particle-canvas" particleDensity={4} />
          </div>
          <h1>Agent and tool runs, priced in USDC.</h1>
          <p className="hero-description">
            Payvoke is building a marketplace where you see the quote, authorize the cost, and get
            the result from the provider that runs the job.
          </p>
          <div className="hero-buttons">
            <WalletAccess variant="hero" label="Sign in with Ethereum" />
            <a className="button-outline" href="#overview">
              Explore Payvoke <ArrowDownRight size={18} strokeWidth={1.8} />
            </a>
          </div>
          <p className="hero-note">
            <ShieldCheck size={15} strokeWidth={1.6} /> Wallet sign-in is available. Marketplace
            transactions are still in development.
          </p>
        </div>
      </div>
      <div className="page-container hero-ticker">
        <span className="ticker-label">PAYVOKE / PRODUCT PREVIEW</span>
        <div className="ticker-elements">
          <span>
            <NetworkAvalancheFuji size={23} /> AVALANCHE FUJI
          </span>
          <b>+</b>
          <span>
            <TokenUSDC size={23} /> USDC
          </span>
          <b>+</b>
          <span>
            <Code2 size={20} strokeWidth={1.5} /> x402
          </span>
          <b>+</b>
          <span>PER-INVOCATION QUOTES</span>
        </div>
        <a className="ticker-end" href="#overview">
          SCROLL TO EXPLORE ↓
        </a>
      </div>
    </section>
  );
}

function Introduction() {
  return (
    <section className="content-section overview-section" id="overview">
      <div className="page-container overview-layout">
        <div className="overview-copy">
          <Eyebrow index="01">WHAT WE'RE BUILDING</Eyebrow>
          <Reveal>
            <h2>Find the right tool. Know what a run costs.</h2>
            <p>
              An agent may research a topic, review a code change, or extract data. Payvoke is
              designed to put the command, inputs, and price together before you authorize a run.
            </p>
            <p>
              The provider operates its own infrastructure. Payvoke coordinates the request and
              records how the payment finishes.
            </p>
          </Reveal>
          <a className="overview-link" href="#how-it-works">
            Follow the proposed workflow <ArrowUpRight size={18} />
          </a>
        </div>
        <Reveal className="overview-visual" delay={0.1}>
          <Showcase />
          <p className="overview-caption">FIG. 01 / MARKETPLACE INTERFACE CONCEPT</p>
        </Reveal>
      </div>
    </section>
  );
}

function Marketplace() {
  return (
    <section className="content-section marketplace-section" id="marketplace">
      <div className="page-container">
        <div className="section-intro">
          <div>
            <Eyebrow index="02">THE MARKETPLACE</Eyebrow>
            <Reveal>
              <h2>
                Choose the work.
                <br />
                <span>See the price.</span>
              </h2>
            </Reveal>
          </div>
          <Reveal className="section-aside">
            <p>
              These sample listings show how an agent or tool could be priced. The marketplace is
              still being built.
            </p>
            <span className="preview-label">
              <span className="status-pulse" /> PRODUCT CONCEPT PREVIEW
            </span>
          </Reveal>
        </div>
        <div className="agent-grid">
          {agents.map(({ index, initials, name, kind, summary, price, icon: Icon }, i) => (
            <Reveal key={index} delay={i * 0.1}>
              <article className="agent-card">
                <div className="agent-top">
                  <span>
                    /{index} — {kind}
                  </span>
                  <ArrowUpRight size={17} />
                </div>
                <div className="agent-art">
                  <span className="art-backdrop" />
                  <div className="art-glyph">
                    <Icon size={46} strokeWidth={1.05} />
                  </div>
                  <span className="art-initials">{initials}</span>
                  <div className="art-marks">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
                <div className="agent-description">
                  <h3>{name}</h3>
                  <p>{summary}</p>
                  <div className="agent-meta">
                    <span>
                      <span className="small-dot" /> ILLUSTRATIVE PRICE
                    </span>
                    <span className="agent-price">
                      {price} <small>USDC / run</small>
                    </span>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
        <p className="marketplace-caption">
          <span>✳</span> THESE ARE CONCEPT EXAMPLES. MARKETPLACE TRANSACTIONS ARE NOT YET AVAILABLE.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="content-section workflow-section" id="how-it-works">
      <div className="page-container">
        <Eyebrow index="03">THE WORKFLOW</Eyebrow>
        <div className="workflow-heading">
          <Reveal>
            <h2>
              One quote
              <br />
              for each run<span className="heading-stop">.</span>
            </h2>
          </Reveal>
          <p>
            The planned payment flow asks for approval before each paid invocation. Providers
            deliver the work from their own servers.
          </p>
        </div>
        <div className="workflow-grid">
          {steps.map((step, i) => (
            <Reveal className="workflow-step" delay={i * 0.09} key={step.number}>
              <span className="step-number">
                {step.number}
                <ArrowDownRight size={19} />
              </span>
              <div className="step-motif">
                <span className="motif-cross">+</span>
                <span className="motif-line" />
                <span className="motif-circle" />
              </div>
              <p className="step-label">{step.label}</p>
              <h3>{step.title}</h3>
              <p className="step-body">{step.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Infrastructure() {
  return (
    <section className="content-section infrastructure-section" id="infrastructure">
      <div className="page-container infrastructure-layout">
        <div className="infrastructure-copy">
          <Eyebrow index="04">UNDER THE HOOD</Eyebrow>
          <Reveal>
            <h2>
              Follow the job
              <br />
              and the <span>funds.</span>
            </h2>
            <p>
              Payvoke coordinates a USDC hold, provider delivery, and the financial outcome of each
              invocation. This is the proposed payment lifecycle.
            </p>
          </Reveal>
          <div className="infra-points">
            <div>
              <span>
                <LockKeyhole size={19} />
              </span>
              <div>
                <strong>Authorize each request</strong>
                <small>Know what you approve before the agent runs.</small>
              </div>
            </div>
            <div>
              <span>
                <Workflow size={19} />
              </span>
              <div>
                <strong>Execution stays with providers</strong>
                <small>The provider receives the job and returns the result.</small>
              </div>
            </div>
            <div>
              <span>
                <Layers3 size={19} />
              </span>
              <div>
                <strong>Transparent payment states</strong>
                <small>Track held funds, settlement, and possible refunds.</small>
              </div>
            </div>
          </div>
        </div>
        <Reveal className="infra-visual">
          <div className="protocol-card">
            <div className="protocol-top">
              <span>PAYMENT LIFECYCLE</span>
              <span>FIG. 003 — CONCEPT</span>
            </div>
            <div className="protocol-track">
              <div className="protocol-node node-buyer">
                <span className="protocol-node-icon">
                  <Fingerprint size={25} />
                </span>
                <span>BUYER</span>
              </div>
              <div className="protocol-bridge">
                <span className="bridge-dot" />
                <span className="bridge-line" />
                <span className="bridge-dot" />
              </div>
              <div className="protocol-node node-vault">
                <span className="protocol-node-icon">
                  <LockKeyhole size={25} />
                </span>
                <span>PAYVOKEVAULT</span>
              </div>
              <div className="protocol-bridge">
                <span className="bridge-dot" />
                <span className="bridge-line" />
                <span className="bridge-dot" />
              </div>
              <div className="protocol-node node-provider">
                <span className="protocol-node-icon">
                  <Cpu size={25} />
                </span>
                <span>PROVIDER</span>
              </div>
            </div>
            <div className="protocol-chart">
              <span className="protocol-chart-head">TRANSACTION FLOW / USDC</span>
              <div className="protocol-chart-lines">
                <div>
                  <span>01 / QUOTE</span>
                  <span className="chart-fill fill-1" />
                  <Check size={15} />
                </div>
                <div>
                  <span>02 / AUTHORIZE</span>
                  <span className="chart-fill fill-2" />
                  <Check size={15} />
                </div>
                <div>
                  <span>03 / EXECUTE</span>
                  <span className="chart-fill fill-3" />
                  <span className="chart-wait">···</span>
                </div>
              </div>
            </div>
            <div className="protocol-foot">
              <span>NETWORK : AVALANCHE FUJI</span>
              <span className="protocol-secure">
                <ShieldCheck size={15} /> ONCHAIN SETTLEMENT DESIGN
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Providers() {
  return (
    <section className="content-section provider-section" id="providers">
      <div className="page-container provider-layout">
        <div>
          <Eyebrow index="05">FOR PROVIDERS</Eyebrow>
          <Reveal>
            <h2>
              Your tools.
              <br />
              <span>Your servers.</span>
            </h2>
            <p>
              Providers will list agents and tools through Payvoke and receive jobs through an API
              and event stream. Your servers do the work. Provider onboarding is in development.
            </p>
            <span className="provider-note">
              <Radio size={16} /> API + SERVER-SENT EVENTS / PLANNED
            </span>
          </Reveal>
        </div>
        <Reveal className="provider-console">
          <div className="console-header">
            <span>
              <Radio size={17} /> PROVIDER JOB LIFECYCLE
            </span>
            <span>API / SSE</span>
          </div>
          <div className="provider-events">
            {providerFlow.map((item) => (
              <div className="provider-event" key={item.number}>
                <span className="provider-number">{item.number}</span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                </div>
                <ArrowUpRight size={15} aria-hidden="true" />
              </div>
            ))}
          </div>
          <div className="console-foot">
            <span>PROVIDER-OWNED EXECUTION</span>
            <span>
              SPECIFICATION PREVIEW <span className="cursor-block" />
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-container footer-top">
        <div>
          <Link to="/" className="brand">
            <Mark small />
            <span className="brand-word">
              payvoke<span className="brand-period">.</span>
            </span>
          </Link>
          <p>Agent and tool runs, priced in USDC.</p>
        </div>
        <div className="footer-links">
          <a href="/#overview">Overview</a>
          <a href="/#marketplace">Marketplace</a>
          <a href="/#how-it-works">How it works</a>
          <a href="/#providers">Providers</a>
          <a href="/#top">Back to top ↑</a>
        </div>
      </div>
      <div className="page-container footer-bottom">
        <span>© 2026 PAYVOKE · MARKETPLACE PREVIEW</span>
        <span>
          <span className="status-pulse" /> FUJI TESTNET · NO REAL FUNDS
        </span>
      </div>
    </footer>
  );
}

export function LandingPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <Introduction />
        <Marketplace />
        <HowItWorks />
        <Infrastructure />
        <Providers />
      </main>
      <Footer />
    </>
  );
}
