const DEFAULT_MAX_ROWS = 10000;
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_LIMIT = 100;
const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 30;
const DEFAULT_HTTP_PORT = 3333;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_MAX_WRITE_ROWS = 100;

type Environment = NodeJS.ProcessEnv;

export type McpTransportMode = "stdio" | "http";

export interface EnvironmentConfig {
  serverName: string;
  serverPort?: number;
  databaseName: string;
  databases: string[];
  dbUser: string;
  dbPassword: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  readOnly: boolean;
  enableDdl: boolean;
  connectionTimeoutSeconds: number;
  queryTimeoutMs: number;
  maxRows: number;
  maxWriteRows: number;
  requireWritePreview: boolean;
  mcpTransport: McpTransportMode;
  mcpHttpHost: string;
  mcpHttpPort: number;
  mcpBaseUrl?: string;
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum = 1,
  maximum?: number
): number {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be a whole number of at least ${minimum}.`);
  }

  const parsed = Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
    const range = maximum
      ? `between ${minimum} and ${maximum}`
      : `of at least ${minimum}`;
    throw new Error(`${name} must be a whole number ${range}.`);
  }

  return parsed;
}

function parseRequiredString(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is required and must not be blank.`);
  }
  return normalized;
}

function parseBoolean(
  name: string,
  value: string | undefined,
  fallback?: boolean
): boolean {
  if (value === undefined && fallback !== undefined) {
    return fallback;
  }

  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }

  if (normalized === "false") {
    return false;
  }

  const requirement =
    fallback === undefined ? "is required and must be" : "must be";
  throw new Error(`${name} ${requirement} either "true" or "false".`);
}

function parseServerPort(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(
      "SERVER_PORT must be a valid TCP port between 1 and 65535."
    );
  }

  const port = Number(normalized);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "SERVER_PORT must be a valid TCP port between 1 and 65535."
    );
  }

  return port;
}

function parseMcpBaseUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("MCP_BASE_URL must be a valid absolute HTTP or HTTPS URL.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("MCP_BASE_URL must be a valid absolute HTTP or HTTPS URL.");
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

export function parseDatabaseList(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((database) => database.trim())
    .filter(Boolean);
}

export function parseEnvironmentConfig(
  env: Environment = process.env
): EnvironmentConfig {
  const databasesValue = parseRequiredString("DATABASES", env.DATABASES);
  const databases = parseDatabaseList(databasesValue);
  if (databases.length === 0) {
    throw new Error(
      "DATABASES is required and must contain at least one database name."
    );
  }

  return {
    serverName: parseRequiredString("SERVER_NAME", env.SERVER_NAME),
    serverPort: parseServerPort(env.SERVER_PORT),
    databaseName: parseRequiredString("DATABASE_NAME", env.DATABASE_NAME),
    databases,
    dbUser: parseRequiredString("DB_USER", env.DB_USER),
    dbPassword: parseRequiredString("DB_PASSWORD", env.DB_PASSWORD),
    encrypt: parseBoolean("ENCRYPT", env.ENCRYPT, false),
    trustServerCertificate: parseBoolean(
      "TRUST_SERVER_CERTIFICATE",
      env.TRUST_SERVER_CERTIFICATE
    ),
    readOnly: parseBoolean("READONLY", env.READONLY),
    enableDdl: parseBoolean("ENABLE_DDL", env.ENABLE_DDL),
    connectionTimeoutSeconds: parseInteger(
      "CONNECTION_TIMEOUT",
      env.CONNECTION_TIMEOUT,
      DEFAULT_CONNECTION_TIMEOUT_SECONDS
    ),
    queryTimeoutMs: parseInteger(
      "QUERY_TIMEOUT_MS",
      env.QUERY_TIMEOUT_MS,
      DEFAULT_QUERY_TIMEOUT_MS
    ),
    maxRows: parseInteger("MAX_ROWS", env.MAX_ROWS, DEFAULT_MAX_ROWS),
    maxWriteRows: parseInteger(
      "MAX_WRITE_ROWS",
      env.MAX_WRITE_ROWS,
      DEFAULT_MAX_WRITE_ROWS
    ),
    requireWritePreview: parseBoolean(
      "REQUIRE_WRITE_PREVIEW",
      env.REQUIRE_WRITE_PREVIEW,
      true
    ),
    mcpTransport: parseMcpTransport(env.MCP_TRANSPORT),
    mcpHttpHost: env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST,
    mcpHttpPort: parseInteger(
      "MCP_HTTP_PORT",
      env.MCP_HTTP_PORT,
      DEFAULT_HTTP_PORT,
      1,
      65535
    ),
    mcpBaseUrl: parseMcpBaseUrl(env.MCP_BASE_URL),
  };
}

function parseMcpTransport(value: string | undefined): McpTransportMode {
  if (value === undefined) {
    return "stdio";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "stdio" || normalized === "http") {
    return normalized;
  }

  throw new Error('MCP_TRANSPORT must be either "stdio" or "http".');
}

export function getServerPort(): number | undefined {
  return parseServerPort(process.env.SERVER_PORT);
}

export function getConnectionTimeoutSeconds(): number {
  return parseInteger(
    "CONNECTION_TIMEOUT",
    process.env.CONNECTION_TIMEOUT,
    DEFAULT_CONNECTION_TIMEOUT_SECONDS
  );
}

export function getTrustServerCertificate(): boolean {
  return parseBoolean(
    "TRUST_SERVER_CERTIFICATE",
    process.env.TRUST_SERVER_CERTIFICATE
  );
}

export function isReadOnly(): boolean {
  return parseBoolean("READONLY", process.env.READONLY);
}

export function getMaxRows(): number {
  return parseInteger("MAX_ROWS", process.env.MAX_ROWS, DEFAULT_MAX_ROWS);
}

export function getQueryTimeoutMs(): number {
  return parseInteger(
    "QUERY_TIMEOUT_MS",
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
  return parseMcpTransport(process.env.MCP_TRANSPORT);
}

export function getMcpHttpPort(): number {
  return parseInteger(
    "MCP_HTTP_PORT",
    process.env.MCP_HTTP_PORT,
    DEFAULT_HTTP_PORT,
    1,
    65535
  );
}

export function getMcpHttpHost(): string {
  return process.env.MCP_HTTP_HOST?.trim() || DEFAULT_HTTP_HOST;
}

export function getMcpBaseUrl(): string | undefined {
  return parseMcpBaseUrl(process.env.MCP_BASE_URL);
}

export function getMcpEndpointUrl(
  environment: Pick<
    EnvironmentConfig,
    "mcpBaseUrl" | "mcpHttpHost" | "mcpHttpPort"
  >
): string {
  const baseUrl =
    environment.mcpBaseUrl ??
    `http://${environment.mcpHttpHost}:${environment.mcpHttpPort}`;
  return `${baseUrl.replace(/\/+$/, "")}/mcp`;
}

export function isDdlEnabled(): boolean {
  return parseBoolean("ENABLE_DDL", process.env.ENABLE_DDL);
}

export function getMaxWriteRows(): number {
  return parseInteger(
    "MAX_WRITE_ROWS",
    process.env.MAX_WRITE_ROWS,
    DEFAULT_MAX_WRITE_ROWS
  );
}

export function isWritePreviewRequired(): boolean {
  return parseBoolean(
    "REQUIRE_WRITE_PREVIEW",
    process.env.REQUIRE_WRITE_PREVIEW,
    true
  );
}
