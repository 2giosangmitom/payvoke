import { z } from "zod";

export const configSchema = z.object({
  PAYVOKE_API_URL: z.url().default("https://payvoke.up.railway.app"),
  PAYVOKE_APP_ID: z.string().min(1),
  PAYVOKE_KEY: z.string().regex(/^pvk_.+$/),
  OPENROUTER_API_KEY: z.string().min(1),
  MODEL: z.string().min(1).default("openrouter/nvidia/nemotron-3.5-lightning:free"),
  FALLBACK_MODELS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  MODEL_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  PRICE_REVIEW_CV: z
    .string()
    .regex(/^[1-9]\d*$/)
    .default("150000"),
  STATE_DIR: z.string().min(1).default(".data"),
});

export type Config = z.infer<typeof configSchema>;
