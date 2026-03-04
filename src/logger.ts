import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Logs go to <project-root>/logs/mssql-mcp.log (set LOG_DIR env to override)
const LOG_DIR = process.env.LOG_DIR || join(__dirname, "..", "logs");
const LOG_FILE = join(LOG_DIR, "mssql-mcp.log");

let logEnabled = true;
let dirReady = false;

function ensureLogDir(): boolean {
  if (dirReady) return logEnabled;
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    dirReady = true;
    return true;
  } catch {
    logEnabled = false;
    return false;
  }
}

function timestamp() {
  return new Date().toISOString();
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/** Write a log line to the file (synchronous for reliability) */
export function log(level: string, message: string, data?: unknown) {
  if (!logEnabled || !ensureLogDir()) return;
  try {
    const payload = data !== undefined ? ` ${safeStringify(data)}` : "";
    const line = `${timestamp()} [${level}] ${message}${payload}\n`;
    appendFileSync(LOG_FILE, line);
  } catch {
    // ignore write errors
  }
}

export function getLogPath(): string {
  return LOG_FILE;
}
