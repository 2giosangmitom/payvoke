import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fontless } from "fontless";
import { nitro } from "nitro/vite";

// Serves the API under the web origin so its SameSite=Lax session and SIWE
// cookies stay first-party. On Vercel these become CDN rewrites.
const apiProxy = process.env.API_PROXY_TARGET?.replace(/\/+$/, "");

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tanstackStart({
      router: {
        routeTreeFileHeader: ["// oxfmt-ignore", "// @ts-nocheck"],
      },
    }),
    nitro(
      apiProxy
        ? {
            routeRules: {
              "/v1/**": { proxy: `${apiProxy}/v1/**` },
              "/mcp": { proxy: `${apiProxy}/mcp` },
            },
          }
        : {},
    ),
    viteReact(),
    tailwindcss(),
    fontless({
      providers: {
        adobe: false,
        bunny: false,
        fontshare: false,
        fontsource: false,
        googleicons: false,
        npm: false,
      },
      defaults: {
        weights: ["400 800"],
        styles: ["normal"],
        subsets: ["latin", "latin-ext", "vietnamese"],
      },
      families: [
        { name: "Geist", provider: "google", preload: true },
        { name: "JetBrains Mono", provider: "google", weights: [400, 500, 600] },
      ],
    }),
  ],
});
