import { run } from "./cli";

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  log: (line) => console.log(line),
});
