import { z } from "zod";

// Reuse same config as csv-analyst
export const config = z
  .object({
    PAYVOKE_API_URL: z.string().url().default("https://payvoke.up.railway.app"),
    PAYVOKE_APP_ID: z.string().min(1),
    PAYVOKE_KEY: z.string().startsWith("pvk_"),
    OPENROUTER_API_KEY: z.string().min(1),
    MODEL: z.string().default("openrouter/nvidia/nemotron-3.5-lightning:free"),
    FALLBACK_MODELS: z
      .string()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean),
      ),
    MODEL_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
    PRICE_FIND_JOB: z.string().default("150000"),
    STATE_DIR: z.string().default(".data"),
    // Agent hires agent (off unless both are set): find_job first buys a
    // cv-reviewer quick_review over x402, paid from Job Finder's own wallet.
    CV_REVIEWER_APP_ID: z.string().optional(),
    JOB_FINDER_BUYER_KEY: z.string().optional(),
    CV_REVIEWER_MAX_AMOUNT: z.string().regex(/^\d+$/).default("500000"),
    CV_REVIEWER_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
    // The web origin the API trusts for SIWE, when it is not PAYVOKE_API_URL's.
    PAYVOKE_WEB_ORIGIN: z.string().url().optional(),
  })
  .parse(process.env);

export const usdc = (atomicAmount: string) => (Number(atomicAmount) / 1e6).toFixed(2);
