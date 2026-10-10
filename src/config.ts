const DEFAULT_MAX_ROWS = 10000;
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_LIMIT = 100;
const DEFAULT_CONNECTION_TIMEOUT_SECONDS = 30;
const DEFAULT_HTTP_PORT = 3333;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_MAX_WRITE_ROWS = 100;

type Environment = NodeJS.ProcessEnv;

export type McpTransportMode = "stdio" | "http";

export const SQL_AUTH_TYPES = [
  "sql",
  "ntlm",
  "azure-default",
  "azure-service-principal",
  "azure-access-token",
] as const;

export type SqlAuthType = (typeof SQL_AUTH_TYPES)[number];

export type SqlAuthConfig =
  | { type: "sql"; user: string; password: string }
  | { type: "ntlm"; user: string; password: string; domain: string }
  | { type: "azure-default"; clientId?: string }
  | {
      type: "azure-service-principal";
      clientId: string;
      clientSecret: string;
      tenantId: string;
    }
  | { type: "azure-access-token"; token: string };

export interface SqlConnectionConfig {
  serverName: string;
  serverPort?: number;
  auth: SqlAuthConfig;
  encrypt: boolean;
  trustServerCertificate: boolean;
  connectionTimeoutSeconds: number;
  queryTimeoutMs: number;
}

export interface EnvironmentConfig extends SqlConnectionConfig {
  databaseName: string;
  databases: string[];
  readOnly: boolean;
  enableDdl: boolean;
  maxRows: number;
  maxWriteRows: number;
  requireWritePreview: boolean;
  mcpTransport: McpTransportMode;
  mcpHttpHost: string;
  mcpHttpPort: number;
  mcpBaseUrl?: string;
  mcpHttpAuthToken?: string;
  mcpHttpAllowUnauthenticated: boolean;
  mcpHttpAllowedHosts: string[];
}

let runtimeEnvironment: EnvironmentConfig | undefined;

export function configureRuntimeEnvironment(
  environment: EnvironmentConfig
): void {
  runtimeEnvironment = {
    ...environment,
    databases: [...environment.databases],
  };
}

function parseInteger(
  name: string,
  value: string | undefined,
  fallback: number,
  minimum = 1,
  maximum?: number
): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const range =
    maximum !== undefined
      ? `between ${minimum} and ${maximum}`
      : `of at least ${minimum}`;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${name} must be a whole number ${range}.`);
  }

  const parsed = Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    (maximum !== undefined && parsed > maximum)
  ) {
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
  if ((value === undefined || value.trim() === "") && fallback !== undefined) {
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
  if (value === undefined || value.trim() === "") {
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

function parseSqlAuthType(value: string | undefined): SqlAuthType {
  if (value === undefined || value.trim() === "") {
    return "sql";
  }

  const normalized = value.trim().toLowerCase();
  if ((SQL_AUTH_TYPES as readonly string[]).includes(normalized)) {
    return normalized as SqlAuthType;
  }

  throw new Error(`SQL_AUTH_TYPE must be one of: ${SQL_AUTH_TYPES.join(", ")}.`);
}

export function parseSqlAuthConfig(
  env: Environment = process.env
): SqlAuthConfig {
  const type = parseSqlAuthType(env.SQL_AUTH_TYPE);
  switch (type) {
    case "sql":
      return {
        type,
        user: parseRequiredString("DB_USER", env.DB_USER),
        password: parseRequiredString("DB_PASSWORD", env.DB_PASSWORD),
      };
    case "ntlm":
      return {
        type,
        user: parseRequiredString("DB_USER", env.DB_USER),
        password: parseRequiredString("DB_PASSWORD", env.DB_PASSWORD),
        domain: parseRequiredString("DB_DOMAIN", env.DB_DOMAIN),
      };
    case "azure-default": {
      const clientId = env.AZURE_CLIENT_ID?.trim();
      return clientId ? { type, clientId } : { type };
    }
    case "azure-service-principal":
      return {
        type,
        clientId: parseRequiredString("AZURE_CLIENT_ID", env.AZURE_CLIENT_ID),
        clientSecret: parseRequiredString(
          "AZURE_CLIENT_SECRET",
          env.AZURE_CLIENT_SECRET
        ),
        tenantId: parseRequiredString("AZURE_TENANT_ID", env.AZURE_TENANT_ID),
      };
    case "azure-access-token":
      return {
        type,
        token: parseRequiredString("AZURE_ACCESS_TOKEN", env.AZURE_ACCESS_TOKEN),
      };
  }
}

export function parseSqlConnectionConfig(
  env: Environment = process.env
): SqlConnectionConfig {
  const auth = parseSqlAuthConfig(env);
  const isEntraAuth = auth.type.startsWith("azure-");
  return {
    serverName: env.SERVER_NAME?.trim() || "localhost",
    serverPort: parseServerPort(env.SERVER_PORT),
    auth,
    // Azure SQL requires TLS and presents publicly trusted certificates, so
    // Entra ID auth types default to encrypting and validating the certificate.
    encrypt: parseBoolean("ENCRYPT", env.ENCRYPT, isEntraAuth),
    trustServerCertificate: parseBoolean(
      "TRUST_SERVER_CERTIFICATE",
      env.TRUST_SERVER_CERTIFICATE,
      !isEntraAuth
    ),
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
  };
}

export function parseEnvironmentConfig(
  env: Environment = process.env
): EnvironmentConfig {
  const explicitDefault = env.DATABASE_NAME?.trim();
  const configuredDatabases = parseDatabaseList(env.DATABASES);
  const databases =
    configuredDatabases.length > 0
      ? configuredDatabases
      : explicitDefault
        ? [explicitDefault]
        : [];
  if (databases.length === 0) {
    throw new Error(
      "At least one of DATABASE_NAME or DATABASES is required and must contain a database name."
    );
  }

  const databaseName =
    explicitDefault && databases.includes(explicitDefault)
      ? explicitDefault
      : databases[0];

  return {
    ...parseSqlConnectionConfig(env),
    databaseName,
    databases,
    readOnly: parseBoolean("READONLY", env.READONLY, false),
    enableDdl: parseBoolean("ENABLE_DDL", env.ENABLE_DDL, false),
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
    mcpHttpAuthToken: env.MCP_HTTP_AUTH_TOKEN?.trim() || undefined,
    mcpHttpAllowUnauthenticated: parseBoolean(
      "MCP_HTTP_ALLOW_UNAUTHENTICATED",
      env.MCP_HTTP_ALLOW_UNAUTHENTICATED,
      false
    ),
    mcpHttpAllowedHosts: parseDatabaseList(env.MCP_HTTP_ALLOWED_HOSTS).map(
      (host) => host.toLowerCase()
    ),
  };
}

function parseMcpTransport(value: string | undefined): McpTransportMode {
  if (value === undefined || value.trim() === "") {
    return "stdio";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "stdio" || normalized === "http") {
    return normalized;
  }

  throw new Error('MCP_TRANSPORT must be either "stdio" or "http".');
}

export function getMaxRows(): number {
  if (runtimeEnvironment) {
    return runtimeEnvironment.maxRows;
  }
  return parseInteger("MAX_ROWS", process.env.MAX_ROWS, DEFAULT_MAX_ROWS);
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

export function getMcpEndpointUrl(
  environment: Pick<
    EnvironmentConfig,
    "mcpBaseUrl" | "mcpHttpHost" | "mcpHttpPort"
  >
): string {
  const baseUrl =
    environment.mcpBaseUrl ??
    `http://${formatUrlHost(environment.mcpHttpHost)}:${environment.mcpHttpPort}`;
  return `${baseUrl.replace(/\/+$/, "")}/mcp`;
}

/** Brackets IPv6 literals (`::1` -> `[::1]`) for use in a URL authority. */
export function formatUrlHost(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

export function getMaxWriteRows(): number {
  if (runtimeEnvironment) {
    return runtimeEnvironment.maxWriteRows;
  }
  return parseInteger(
    "MAX_WRITE_ROWS",
    process.env.MAX_WRITE_ROWS,
    DEFAULT_MAX_WRITE_ROWS
  );
}
