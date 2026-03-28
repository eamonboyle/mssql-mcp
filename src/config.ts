const DEFAULT_MAX_ROWS = 10000;
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_LIMIT = 100;
const DEFAULT_HTTP_PORT = 3333;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_MAX_WRITE_ROWS = 100;

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  minimum = 1
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
}

function parseBoolean(
  value: string | undefined,
  fallback: boolean
): boolean {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  return fallback;
}

export type McpTransportMode = "stdio" | "http";

export function getMaxRows(): number {
  return parsePositiveInt(process.env.MAX_ROWS, DEFAULT_MAX_ROWS);
}

export function getQueryTimeoutMs(): number {
  return parsePositiveInt(
    process.env.QUERY_TIMEOUT_MS,
    DEFAULT_QUERY_TIMEOUT_MS
  );
}

export function getDefaultSearchLimit(): number {
  return Math.min(getMaxRows(), DEFAULT_SEARCH_LIMIT);
}

export function clampRowLimit(limit: unknown, fallback = getMaxRows()): number {
  const parsed =
    typeof limit === "number"
      ? limit
      : typeof limit === "string"
        ? Number.parseInt(limit, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return Math.min(fallback, getMaxRows());
  }

  return Math.min(Math.floor(parsed), getMaxRows());
}

export function getMcpTransport(): McpTransportMode {
  return process.env.MCP_TRANSPORT?.trim().toLowerCase() === "http"
    ? "http"
    : "stdio";
}

export function getMcpHttpPort(): number {
  return parsePositiveInt(process.env.MCP_HTTP_PORT, DEFAULT_HTTP_PORT);
}

export function getMcpHttpHost(): string {
  return process.env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;
}

export function getMcpBaseUrl(): string | undefined {
  const value = process.env.MCP_BASE_URL?.trim();
  return value ? value : undefined;
}

export function isDdlEnabled(): boolean {
  return parseBoolean(process.env.ENABLE_DDL, false);
}

export function getMaxWriteRows(): number {
  return parsePositiveInt(
    process.env.MAX_WRITE_ROWS,
    DEFAULT_MAX_WRITE_ROWS
  );
}

export function isWritePreviewRequired(): boolean {
  return parseBoolean(process.env.REQUIRE_WRITE_PREVIEW, true);
}
