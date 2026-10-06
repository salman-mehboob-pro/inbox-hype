import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

type Level = "info" | "warn" | "error";

// Writes to the console (Vercel picks this up) and, on local dev, also to
// logs/app.log as one JSON line per entry.
const LOG_DIR = path.join(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const writeToFile = process.env.NODE_ENV !== "production";

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return err;
}

function log(level: Level, message: string, context?: Record<string, unknown>) {
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...(context && {
      context: Object.fromEntries(
        Object.entries(context).map(([k, v]) => [k, k === "error" ? serializeError(v) : v]),
      ),
    }),
  };

  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  if (writeToFile) {
    mkdir(LOG_DIR, { recursive: true })
      .then(() => appendFile(LOG_FILE, line + "\n"))
      .catch(() => {
        // Logging must never crash the app.
      });
  }
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
