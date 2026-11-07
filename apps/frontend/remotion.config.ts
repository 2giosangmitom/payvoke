import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";
import { webpack } from "@remotion/bundler";

// Remotion Studio for the landing film (`bun run film`). It bundles with
// webpack, so it needs the app's `@/src` alias, Tailwind v4 and the one Vite
// env value the shared components read.
Config.setEntryPoint("./src/remotion/index.ts");
Config.overrideWebpackConfig((config) => {
  const withTailwind = enableTailwind(config);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      alias: {
        ...withTailwind.resolve?.alias,
        "@/src": path.resolve(process.cwd(), "src"),
      },
    },
    plugins: [
      ...(withTailwind.plugins ?? []),
      new webpack.DefinePlugin({
        "import.meta.env.VITE_API_ORIGIN": JSON.stringify(
          process.env.VITE_API_ORIGIN ?? "http://localhost:3001",
        ),
      }),
    ],
  };
});
