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
    PRICE_ANALYZE_CV: z.string().default("200000"), // atomic USDC
    PRICE_FIND_JOB: z.string().default("150000"),
    STATE_DIR: z.string().default(".data"),
  })
  .parse(process.env);

export const usdc = (atomicAmount: string) => (Number(atomicAmount) / 1e6).toFixed(2);
