import { Link } from "@tanstack/react-router";
import { NetworkAvalancheFuji, TokenUSDC } from "@web3icons/react";
import {
  ArrowRight,
  ArrowUpRight,
  Code2,
  FolderOpen,
  Layers3,
  Search,
  Terminal,
  Wallet,
} from "lucide-react";
import { LandingMusic } from "@/src/components/landing-music";
import { IdeaRefrain } from "@/src/components/idea-refrain";
import { BentoGrid } from "@/src/components/ui/bento-grid";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Card, CardContent } from "@/src/components/ui/card";
import { HeroPixelField } from "@/src/components/ui/hero-pixel-field";
import { ParticleTextEffect } from "@/src/components/ui/interactive-text-particle";
import { TextAnimate } from "@/src/components/ui/text-animate";
import { Button } from "@/src/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";

const catalogCategories = ["Research agents", "Developer tools", "Data utilities"];
const exampleCollections = ["Research", "Projects", "Ideas to try"];

export function LandingPage() {
  return (
    <main className="landing">
      <section className="hero" id="top">
        <HeroPixelField />
        <div className="hero-vignette" aria-hidden="true" />
        <div className="page-container hero-main">
          <div className="hero-copy">
            <p className="hero-badge">
              <span className="badge-square" aria-hidden="true" /> BUILDING ON AVALANCHE FUJI
            </p>
            <div className="particle-wordmark" aria-label="Payvoke">
              <span className="hero-wordmark-fallback" aria-hidden="true">
                PAYVOKE
              </span>
              <ParticleTextEffect text="PAYVOKE" className="particle-canvas" particleDensity={4} />
            </div>
            <TextAnimate
              as="h1"
              by="line"
              animation="blurInUp"
              duration={0.75}
              delay={0.15}
              startOnView={false}
              once
            >
              {"Tools worth sharing.\nAgents worth finding."}
            </TextAnimate>
            <p className="hero-description">
              A marketplace for independent agents and tools. Find your next favorite, or publish
              something you built.
            </p>
            <div className="hero-buttons">
              <Button render={<Link to="/agents" />} className="button-primary">
                Browse agents <ArrowUpRight size={18} />
              </Button>
              <Button render={<Link to="/app" />} variant="outline" className="button-outline">
                Open workspace <ArrowRight size={18} />
              </Button>
            </div>
          </div>
        </div>
        <div className="page-container hero-ticker" aria-label="Platform preview">
          <span className="ticker-label">PAYVOKE / MARKETPLACE PREVIEW</span>
          <div className="ticker-elements">
            <span>
              <NetworkAvalancheFuji size={22} aria-hidden="true" /> AVALANCHE FUJI
            </span>
            <b aria-hidden="true">+</b>
            <span>
              <TokenUSDC size={22} aria-hidden="true" /> USDC
            </span>
            <b aria-hidden="true">+</b>
            <span>
              <Code2 size={19} aria-hidden="true" /> x402
            </span>
          </div>
          <span className="ticker-end">PAYMENTS IN DEVELOPMENT ↓</span>
        </div>
      </section>
      <LandingMusic />

      <section className="content-section story-section" id="overview">
        <div className="page-container story-layout">
          <div>
            <h2 className="sr-only">A little idea, passed on</h2>
            <IdeaRefrain />
          </div>
          <div className="story-copy">
            <p>
              Good tools deserve to travel further than the project they started in. Payvoke gives
              independent builders a place to share them, and everyone else a place to discover.
            </p>
          </div>
        </div>
      </section>

      <section className="content-section discover-section" id="marketplace">
        <div className="page-container">
          <div className="features-heading">
            <BlurFade inView duration={0.55}>
              <p className="section-eyebrow">THE MARKETPLACE / TODAY</p>
              <h2>
                Built to be found.
                <br />
                Made to be used.
              </h2>
            </BlurFade>
            <p>
              Explore what others have made, keep a shortlist for later, and put your own work in
              front of the people who need it.
            </p>
          </div>

          <BentoGrid className="features-grid">
            <Card className="feature-card feature-discover lg:col-span-7">
              <CardContent>
                <div className="feature-card-top">
                  <span className="feature-index">01 / EXPLORE</span>
                  <Search size={22} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="feature-card-copy">
                  <h3>Find the right starting point.</h3>
                  <p>
                    Browse the public directory. Search by name, learn what each listing does, and
                    see who built it.
                  </p>
                  <Link to="/agents" className="text-link">
                    Explore the catalog <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </div>
                <div className="feature-preview catalog-preview" aria-hidden="true">
                  <div className="preview-search">
                    <Search size={16} /> Find an agent or tool
                    <span>⌘ K</span>
                  </div>
                  {catalogCategories.map((category, index) => (
                    <div className="preview-list-row" key={category}>
                      <span className="preview-row-number">0{index + 1}</span>
                      <span>{category}</span>
                      <ArrowUpRight size={15} />
                    </div>
                  ))}
                  <span className="preview-caption">ILLUSTRATIVE CATEGORIES</span>
                </div>
              </CardContent>
            </Card>

            <Card className="feature-card feature-collections lg:col-span-5">
              <CardContent>
                <div className="feature-card-top">
                  <span className="feature-index">02 / COLLECT</span>
                  <FolderOpen size={22} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="feature-card-copy">
                  <h3>Keep the good ones close.</h3>
                  <p>
                    Star useful listings and organize them into collections. Your workspace stays
                    connected to your wallet.
                  </p>
                  <Link to="/app" className="text-link">
                    Open workspace <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </div>
                <div className="feature-preview collections-preview" aria-hidden="true">
                  <span className="preview-caption">YOUR LIBRARY / EXAMPLE</span>
                  {exampleCollections.map((collection, index) => (
                    <div className="collection-preview-row" key={collection}>
                      <FolderOpen size={16} />
                      <span>{collection}</span>
                      <small>0{index + 1}</small>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="feature-card feature-publish lg:col-span-7">
              <CardContent>
                <div className="feature-card-top">
                  <span className="feature-index">03 / PUBLISH</span>
                  <Terminal size={22} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="feature-card-copy">
                  <h3>Your tool. Your infrastructure.</h3>
                  <p>
                    Create a provider app, describe an agent or tool, define its commands and terms,
                    then publish a listing. You remain the operator.
                  </p>
                  <Link to="/app" className="text-link">
                    Start publishing <ArrowUpRight size={17} aria-hidden="true" />
                  </Link>
                </div>
                <div className="feature-preview command-preview" aria-hidden="true">
                  <div className="command-preview-header">
                    <span>EXAMPLE COMMAND</span>
                    <span className="command-draft">DRAFT</span>
                  </div>
                  <strong>/summarize</strong>
                  <div className="command-meta">
                    <span>INPUT SCHEMA</span>
                    <span>OUTPUT SCHEMA</span>
                    <span>PRICE & TERMS</span>
                  </div>
                  <div className="command-preview-footer">
                    Provider app <ArrowRight size={13} /> Command <ArrowRight size={13} /> Listing
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="feature-card feature-future lg:col-span-5">
              <CardContent>
                <div className="feature-card-top">
                  <span className="feature-index">NEXT / IN DEVELOPMENT</span>
                  <Wallet size={22} strokeWidth={1.5} aria-hidden="true" />
                </div>
                <div className="feature-card-copy">
                  <h3>One price for each run.</h3>
                  <p>
                    The planned paid flow uses fixed USDC prices per command, with x402 and
                    PayvokeVault on Avalanche Fuji. Execution and settlement are not live yet.
                  </p>
                </div>
                <div className="future-preview" aria-hidden="true">
                  <Layers3 size={19} />
                  <div>
                    <span>PAY PER INVOCATION</span>
                    <strong>USDC · FUJI TESTNET</strong>
                  </div>
                  <span className="future-preview-status">PLANNED</span>
                </div>
              </CardContent>
            </Card>
          </BentoGrid>
        </div>
      </section>

      <section className="content-section provider-section" id="providers">
        <div className="page-container provider-layout">
          <div className="section-copy">
            <BlurFade inView duration={0.5}>
              <p className="section-eyebrow">FOR THE BUILDERS</p>
              <h2>
                Built something
                <br />
                useful?
              </h2>
              <p>
                Whether it is an agent or a simple utility, give it a home beyond your own
                workspace. Your listing explains the job, the inputs, and the terms.
              </p>
              <Button render={<Link to="/app" />} className="button-primary">
                Open workspace <ArrowUpRight size={18} />
              </Button>
            </BlurFade>
          </div>
          <Accordion className="provider-details">
            <AccordionItem value="tool">
              <AccordionTrigger>How do I publish?</AccordionTrigger>
              <AccordionContent>
                <p>Create a provider app, add commands, and publish a listing.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="terms">
              <AccordionTrigger>Can I set a price?</AccordionTrigger>
              <AccordionContent>
                <p>Set a USDC price and delivery terms for each command.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="next" id="infrastructure">
              <AccordionTrigger>Are paid runs live?</AccordionTrigger>
              <AccordionContent>
                <p>Not yet. Execution and USDC settlement on Fuji are in development.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </section>
    </main>
  );
}
