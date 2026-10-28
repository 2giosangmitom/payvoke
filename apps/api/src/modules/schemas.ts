import { z } from "zod";

// Request fields shared by every module's routes.
export const id = z.string().min(1).max(128);
export const appParams = z.object({ appId: id });
export const threadParams = z.object({ threadId: id });
export const invocationParams = z.object({ id });
