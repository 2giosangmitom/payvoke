import { useState } from "react";
import { Check, FileText, Handshake, RotateCcw } from "lucide-react";
import { AnimatedList } from "@/src/components/ui/animated-list";
import { Badge } from "@/src/components/ui/badge";
import { BlurFade } from "@/src/components/ui/blur-fade";
import { Button } from "@/src/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { NumberTicker } from "@/src/components/ui/number-ticker";
import { cn } from "@/src/lib/utils";

// The landing's example thread. The visitor hires an agent: accept its
// offer, then pick how the job ends and watch where the USDC goes. Nothing
// here calls the API; every figure is sample data that adds up.

type Stage = "offer" | "declined" | "held" | "released" | "refunded";

const PRICE = 0.4;
const START = 5;

const ledgers: Record<Stage, { buyer: number; held: number; agent: number }> = {
  offer: { buyer: START, held: 0, agent: 0 },
  declined: { buyer: START, held: 0, agent: 0 },
  held: { buyer: START - PRICE, held: PRICE, agent: 0 },
  released: { buyer: START - PRICE, held: 0, agent: PRICE },
  refunded: { buyer: START, held: 0, agent: 0 },
};

const usdc = (value: number) => value.toFixed(2);

const outcomes: Partial<Record<Stage, string>> = {
  declined: "Offer declined. Nothing was charged.",
  released: "Delivered in 9 minutes. After the review hour the hold is released to Briefly.",
  refunded: `Nothing arrived in 10 minutes. The vault refunds the full ${usdc(PRICE)} USDC to you.`,
};

export function DemoThread() {
  const [stage, setStage] = useState<Stage>("offer");
  const ledger = ledgers[stage];
  const paid = stage === "held" || stage === "released" || stage === "refunded";

  return (
    <Card data-ui className="w-full gap-0 py-0 text-[14px] leading-relaxed">
      <CardHeader className="grid-cols-[1fr_auto] items-center bg-background-deep py-3">
        <CardTitle>Briefly</CardTitle>
        <Badge variant="outline">Example thread</Badge>
      </CardHeader>

      <CardContent className="grid gap-4 py-5">
        <div className="ml-auto grid max-w-[85%] gap-2 bg-secondary px-3.5 py-2.5">
          <span>
            <code className="font-mono text-primary">/summarize</code> the attached report
          </span>
          <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <FileText size={15} aria-hidden="true" /> q3-report.pdf · 38 pages
          </span>
        </div>

        <p className="max-w-[85%]">
          I can turn this into a one-page summary with the key figures in about 10 minutes.
        </p>

        <Card
          size="sm"
          role="group"
          aria-label="Offer from Briefly"
          className={cn(
            "bg-background-deep ring-2 transition-shadow",
            stage === "offer" ? "ring-primary" : "ring-border",
          )}
        >
          <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
            <span className="row-span-2 grid size-8 place-items-center border border-primary text-primary">
              <Handshake size={17} aria-hidden="true" />
            </span>
            <CardTitle className="text-lg font-semibold tabular-nums">{usdc(PRICE)} USDC</CardTitle>
            <CardDescription className="text-[13px]">
              Offer for <code className="font-mono">/summarize</code>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-3 gap-3 text-[13px]">
              <div>
                <dt className="text-muted-foreground">Delivery</dt>
                <dd>10 min</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Review</dt>
                <dd>1 h</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">If late</dt>
                <dd>Full refund</dd>
              </div>
            </dl>
          </CardContent>
          {stage === "offer" && (
            <CardContent className="flex flex-wrap gap-2">
              <Button onClick={() => setStage("held")}>Accept and pay</Button>
              <Button variant="outline" onClick={() => setStage("declined")}>
                Decline
              </Button>
            </CardContent>
          )}
        </Card>

        <div aria-live="polite" className="grid gap-3">
          {paid && (
            // Each step of the payment lands in turn, newest on top.
            <AnimatedList delay={600} className="items-stretch gap-2">
              {[
                "Signed with your spend key",
                `${usdc(PRICE)} USDC held in PayvokeVault on Avalanche`,
                "Briefly starts the job",
              ].map((event) => (
                <p
                  key={event}
                  className="flex items-center gap-2 bg-primary-soft px-3 py-2 text-[13px]"
                >
                  <Check size={14} className="text-primary" aria-hidden="true" /> {event}
                </p>
              ))}
            </AnimatedList>
          )}
          {stage === "held" && (
            <BlurFade delay={0.1} className="grid gap-2">
              <p className="font-medium">How does the job end?</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStage("released")}>
                  Delivered on time
                </Button>
                <Button variant="secondary" onClick={() => setStage("refunded")}>
                  Deadline passes
                </Button>
              </div>
            </BlurFade>
          )}
          {outcomes[stage] && (
            <BlurFade key={stage} delay={0.1}>
              <p>{outcomes[stage]}</p>
            </BlurFade>
          )}
        </div>
      </CardContent>

      <CardFooter className="grid grid-cols-3 gap-4 border-border bg-background-deep">
        {(
          [
            ["You", ledger.buyer],
            ["Held in vault", ledger.held],
            ["Briefly, before fee", ledger.agent],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <span className="text-[13px] text-muted-foreground">{label}</span>
            <NumberTicker value={value} decimalPlaces={2} className="text-base" />
          </div>
        ))}
        {stage !== "offer" && (
          <Button
            variant="ghost"
            className="col-span-3 text-muted-foreground"
            onClick={() => setStage("offer")}
          >
            <RotateCcw aria-hidden="true" /> Start over
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
