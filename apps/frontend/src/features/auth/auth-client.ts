import { createAuthClient } from "better-auth/react";
import { siweClient } from "better-auth/client/plugins";

// Better Auth is hosted by the Payvoke API, not by TanStack Start.
// Keep its session and SIWE challenge cookies on every request.
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_ORIGIN || "http://localhost:3001",
  basePath: "/v1/auth",
  fetchOptions: { credentials: "include" },
  plugins: [siweClient()],
});
