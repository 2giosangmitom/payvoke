import { createApp } from "./app.js";
import { loadEnvironment } from "./config/environment.js";
import { createOrm } from "./database/orm.js";

async function main(): Promise<void> {
  const env = loadEnvironment();
  const orm = await createOrm(env);
  const app = await createApp({ env, orm });

  const shutdown = (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error) => {
        app.log.error(error);
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await app.listen({ host: "0.0.0.0", port: env.PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
