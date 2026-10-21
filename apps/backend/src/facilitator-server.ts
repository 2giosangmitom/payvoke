import "dotenv/config";
import closeWithGrace from "close-with-grace";
import { createFacilitatorApp } from "./facilitator/app";
import { loadFacilitatorConfig } from "./facilitator/config";

let app: ReturnType<typeof createFacilitatorApp> | undefined;
try {
  const config = loadFacilitatorConfig();
  app = createFacilitatorApp(config);
  await app.listen({ host: config.HOST, port: config.PORT });
  const running = app;
  closeWithGrace(
    { logger: { error: () => running.log.error("Facilitator shutdown failed") } },
    async ({ err }) => {
      if (err) running.log.error("Facilitator closing after an unhandled error");
      await running.close();
    },
  );
} catch {
  await app?.close().catch(() => {});
  console.error("Facilitator startup failed: check configuration, database and RPC");
  process.exitCode = 1;
}
