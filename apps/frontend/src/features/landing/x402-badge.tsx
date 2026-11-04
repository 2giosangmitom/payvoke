import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

// The x402 handshake in one line: the agent answers 402 Payment Required,
// the buyer's payment goes into the vault, and the retry comes back 200 OK.
// The line rolls between the two and loops.

const steps = [
  { code: "402", text: "Payment Required", paid: false, hold: 2200 },
  { code: "200", text: "OK · paid", paid: true, hold: 2600 },
] as const;

const roll = { duration: 0.42, ease: [0.16, 1, 0.3, 1] } as const;

export function X402Badge({ className }: { className?: string }) {
  // Server and first paint draw the 402 line; reduced motion is read after
  // mount so both renders match.
  const [still, setStill] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setStill(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (still) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % steps.length),
      steps[index].hold,
    );
    return () => window.clearTimeout(timer);
  }, [index, still]);

  const step = steps[index];
  return (
    <span
      className={cn(
        "flex items-center gap-2.5 border border-border-strong/60 bg-card px-3.5 py-2 shadow-float",
        className,
      )}
    >
      <span
        className={cn(
          "relative grid size-[22px] place-items-center font-mono text-[10px] font-semibold transition-colors duration-300",
          step.paid ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground",
        )}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {step.paid && !still ? (
            <motion.span
              key="check"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 22 }}
              className="grid place-items-center"
            >
              <Check size={13} strokeWidth={2.5} />
            </motion.span>
          ) : (
            <motion.span
              key="mark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              $
            </motion.span>
          )}
        </AnimatePresence>
        {/* A ring goes out once each time a payment lands. */}
        {step.paid && !still && (
          <motion.span
            key={`ring-${index}`}
            aria-hidden="true"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 1.9 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="absolute inset-0 border border-primary"
          />
        )}
      </span>
      <span className="grid leading-tight">
        <span className="text-[14px] font-semibold">x402 payments</span>
        <span className="relative h-[15px] min-w-[10.5rem] overflow-hidden font-mono text-[11px]">
          {still ? (
            <span className="text-muted-foreground">402 → 200 OK</span>
          ) : (
            <AnimatePresence initial={false}>
              <motion.span
                key={step.code}
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: "0%", opacity: 1 }}
                exit={{ y: "-100%", opacity: 0 }}
                transition={roll}
                className="absolute inset-x-0 top-0 flex gap-1.5 whitespace-nowrap"
              >
                <span className={step.paid ? "text-primary" : "text-warning"}>{step.code}</span>
                <span className="text-muted-foreground">{step.text}</span>
              </motion.span>
            </AnimatePresence>
          )}
        </span>
      </span>
    </span>
  );
}
