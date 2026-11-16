import { z } from "zod";

const atomic = z.string().regex(/^[1-9]\d*$/, "atomic USDC, e.g. 500000 for 0.50");

// Bun loads .env from the working directory before this runs.
export const config = z
  .object({
    PAYVOKE_API_URL: z.url().default("https://payvoke.up.railway.app"),
    PAYVOKE_APP_ID: z.string().min(1),
    PAYVOKE_KEY: z.string().startsWith("pvk_"),
    OPENROUTER_API_KEY: z.string().min(1),
    MODEL: z.string().default("openrouter/nvidia/nemotron-3.5-lightning:free"),
    // Comma-separated models tried in order when MODEL is rate limited or down.
    FALLBACK_MODELS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    // Retries per model, with backoff, before moving to the next one.
    MODEL_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    PRICE_QUICK: atomic.default("500000"),
    PRICE_DEEP: atomic.default("1000000"),
    STATE_DIR: z.string().default(".data"),
  })
  .parse(Bun.env);

export const usdc = (atomicAmount: string) => (Number(atomicAmount) / 1e6).toFixed(2);
