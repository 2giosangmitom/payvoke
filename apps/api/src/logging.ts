import { AsyncLocalStorage } from "node:async_hooks";
import {
  configure,
  getConsoleSink,
  getLogger,
  jsonLinesFormatter,
  parseLogLevel,
  type Logger,
  type Sink,
} from "@logtape/logtape";
import { redactByField } from "@logtape/redaction";
import { redactedLogFields } from "#core/runtime";

export type { Logger };

// Every Payvoke logger sits under ["payvoke", ...]. Until the server calls
// configureLogging, LogTape discards records, so tests and tools log nothing.
export const logger = (...category: string[]) => getLogger(["payvoke", ...category]);

// Wraps a sink so sensitive properties are replaced before it sees a record.
export const redacting = (sink: Sink) =>
  redactByField(sink, { fieldPatterns: redactedLogFields, action: () => "[REDACTED]" });

// JSON lines on stdout, at LOG_LEVEL ("silent" disables output). The context
// storage carries the request ID the HTTP middleware adds to every record.
export async function configureLogging(level: string) {
  await configure({
    sinks: { console: redacting(getConsoleSink({ formatter: jsonLinesFormatter })) },
    contextLocalStorage: new AsyncLocalStorage(),
    loggers: [
      {
        category: ["payvoke"],
        lowestLevel:
          level === "silent" ? null : parseLogLevel(level === "warn" ? "warning" : level),
        sinks: ["console"],
      },
      { category: ["logtape", "meta"], lowestLevel: "warning", sinks: ["console"] },
    ],
  });
}
