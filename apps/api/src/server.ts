import "dotenv/config";
import closeWithGrace from "close-with-grace";
import { createApp } from "./app";
import { loadConfig } from "./config";

try {
  const config = loadConfig();
  const app = createApp(config);
  await app.listen({ host: config.HOST, port: config.PORT });

  closeWithGrace(
    { logger: { error: () => app.log.error("Graceful shutdown failed") } },
    async ({ signal, err }) => {
      if (err) app.log.error("Server closing after an unhandled error");
      else app.log.info({ signal }, "Server closing");
      await app.close();
    },
  );
} catch {
  // Startup errors can contain connection strings. Fail without printing secrets.
  console.error("Backend startup failed: check configuration and listen address");
  process.exitCode = 1;
}
