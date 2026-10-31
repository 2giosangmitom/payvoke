import { z } from "zod";

// Request fields shared by every module's routes.
export const id = z.string().min(1).max(128);
export const appParams = z.object({ appId: id });
export const threadParams = z.object({ threadId: id });
export const invocationParams = z.object({ id });

// Response fields shared by the documented views (http/openapi.ts).
export const timestamp = z.iso.datetime().meta({ description: "ISO 8601 timestamp." });
export const usdcAmount = z
  .string()
  .regex(/^[1-9]\d*$/)
  .meta({
    description: "USDC in atomic units (6 decimals) as an integer string: 2500000 is 2.50 USDC.",
    examples: ["2500000"],
  });
