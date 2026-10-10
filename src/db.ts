import { AsyncLocalStorage } from "node:async_hooks";
import sql from "mssql";
import {
  type EnvironmentConfig,
  type SqlAuthConfig,
  type SqlConnectionConfig,
  parseDatabaseList,
} from "./config.js";

// Connection pools keyed by database name. Pending connects are tracked so
// concurrent first requests share one pool instead of racing to create two.
const sqlPools = new Map<string, sql.ConnectionPool>();
const pendingPools = new Map<string, Promise<sql.ConnectionPool>>();

interface SqlRequestContext {
  signal?: AbortSignal;
}

interface SqlRequestStore extends SqlRequestContext {
  // Abort listeners added by bindRequestCancellation, removed when the MCP
  // request finishes (mssql only emits "done" in stream mode).
  cleanups: Set<() => void>;
}

const requestContext = new AsyncLocalStorage<SqlRequestStore>();

/**
 * Runs `fn` with an MCP request context so SQL requests created inside it are
 * cancelled when the client cancels the MCP request.
 */
export function runWithSqlRequestContext<T>(
  context: SqlRequestContext,
  fn: () => Promise<T>
): Promise<T> {
  const store: SqlRequestStore = { ...context, cleanups: new Set() };
  return requestContext.run(store, async () => {
    try {
      return await fn();
    } finally {
      for (const cleanup of store.cleanups) {
        cleanup();
      }
      store.cleanups.clear();
    }
  });
}

/** Cancels `request` when the current MCP request is aborted. */
export function bindRequestCancellation(request: sql.Request): sql.Request {
  const store = requestContext.getStore();
  const signal = store?.signal;
  if (!store || !signal) {
    return request;
  }
  // mssql resets its cancel flag when a query starts, so a cancel issued
  // before then would be lost: fail fast instead.
  signal.throwIfAborted();
  const onAbort = () => request.cancel();
  const cleanup = () => {
    signal.removeEventListener("abort", onAbort);
    store.cleanups.delete(cleanup);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  store.cleanups.add(cleanup);
  // Streamed requests can release the listener as soon as they finish.
  request.once("done", cleanup);
  return request;
}

let sqlConnectionConfig: SqlConnectionConfig | undefined;
let configuredDefaultDatabase: string | undefined;
let configuredDatabases: string[] | undefined;

export function configureSqlConnection(config: SqlConnectionConfig): void {
  sqlConnectionConfig = { ...config };
}

export function configureDatabase(environment: EnvironmentConfig): void {
  configureSqlConnection(environment);
  configuredDefaultDatabase = environment.databaseName;
  configuredDatabases = [...environment.databases];
}

function getSqlConnectionConfig(): SqlConnectionConfig {
  if (!sqlConnectionConfig) {
    throw new Error("SQL connection configuration has not been initialized.");
  }
  return sqlConnectionConfig;
}

export function getDefaultDatabaseName(): string | null {
  if (configuredDefaultDatabase) {
    return configuredDefaultDatabase;
  }
  const allowedDatabases = parseDatabaseList(process.env.DATABASES);
  const explicitDefault = process.env.DATABASE_NAME?.trim();

  if (allowedDatabases.length === 0) {
    return explicitDefault ?? null;
  }

  if (explicitDefault && allowedDatabases.includes(explicitDefault)) {
    return explicitDefault;
  }

  return allowedDatabases[0] ?? null;
}

/**
 * Returns the list of allowed database names.
 * If DATABASES is set, returns those; otherwise returns only DATABASE_NAME.
 */
export function getAllowedDatabases(): string[] {
  if (configuredDatabases) {
    return [...configuredDatabases];
  }
  const allowedDatabases = parseDatabaseList(process.env.DATABASES);
  if (allowedDatabases.length > 0) {
    return allowedDatabases;
  }

  const defaultDb = process.env.DATABASE_NAME?.trim();
  return defaultDb ? [defaultDb] : [];
}

/**
 * Resolves the database name to use (param or default).
 * Returns null if invalid.
 */
export function resolveDatabaseName(databaseName?: string): string | null {
  const resolved = databaseName?.trim() || getDefaultDatabaseName();
  if (!resolved) return null;

  const allowed = getAllowedDatabases();
  if (allowed.length === 0) return null;
  if (allowed.includes(resolved)) return resolved;
  return null;
}

function buildAuthentication(
  auth: SqlAuthConfig
): Pick<sql.config, "user" | "password" | "domain" | "authentication"> {
  switch (auth.type) {
    case "sql":
      return { user: auth.user, password: auth.password };
    case "ntlm":
      return { user: auth.user, password: auth.password, domain: auth.domain };
    case "azure-default":
      return {
        authentication: {
          type: "azure-active-directory-default",
          options: auth.clientId ? { clientId: auth.clientId } : {},
        },
      };
    case "azure-service-principal":
      return {
        authentication: {
          type: "azure-active-directory-service-principal-secret",
          options: {
            clientId: auth.clientId,
            clientSecret: auth.clientSecret,
            tenantId: auth.tenantId,
          },
        },
      };
    case "azure-access-token":
      return {
        authentication: {
          type: "azure-active-directory-access-token",
          options: { token: auth.token },
        },
      };
  }
}

export function buildSqlConfig(
  databaseName: string,
  environment: SqlConnectionConfig
): sql.config {
  const config: sql.config = {
    server: environment.serverName,
    database: databaseName,
    ...buildAuthentication(environment.auth),
    requestTimeout: environment.queryTimeoutMs,
    options: {
      encrypt: environment.encrypt,
      trustServerCertificate: environment.trustServerCertificate,
      enableArithAbort: true,
      useUTC: false,
    },
    connectionTimeout: environment.connectionTimeoutSeconds * 1000,
  };

  if (environment.serverPort !== undefined) {
    config.port = environment.serverPort;
  }

  return config;
}

async function resolveConfiguredDatabase(
  databaseName?: string
): Promise<{ databaseName: string; error?: string }> {
  const resolved = resolveDatabaseName(databaseName);
  if (!resolved) {
    const allowed = getAllowedDatabases();
    const configurationHint =
      allowed.length > 0
        ? `Allowed: ${allowed.join(", ")}.`
        : "Set DATABASE_NAME or DATABASES to configure database access.";

    return {
      databaseName: "",
      error: `Invalid or disallowed database. ${configurationHint} Use the databaseName parameter to target a specific configured database.`,
    };
  }

  return { databaseName: resolved };
}

/**
 * Ensures a connection pool exists for the given database.
 */
export async function ensureSqlConnection(
  databaseName: string
): Promise<sql.ConnectionPool> {
  const existing = sqlPools.get(databaseName);
  if (existing && existing.connected) {
    return existing;
  }

  const pending = pendingPools.get(databaseName);
  if (pending) {
    return pending;
  }

  const connecting = (async () => {
    if (existing) {
      sqlPools.delete(databaseName);
      await existing.close().catch(() => undefined);
    }

    const config = buildSqlConfig(databaseName, getSqlConnectionConfig());
    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    sqlPools.set(databaseName, pool);
    return pool;
  })();

  pendingPools.set(databaseName, connecting);
  try {
    return await connecting;
  } finally {
    pendingPools.delete(databaseName);
  }
}

/** Closes every cached connection pool (used on shutdown). */
export async function closeAllPools(): Promise<void> {
  const pools = [...sqlPools.values()];
  sqlPools.clear();
  await Promise.allSettled(pools.map((pool) => pool.close()));
}

/**
 * Returns the shared connection pool for the given (or default) database.
 */
export async function getSqlPool(
  databaseName?: string
): Promise<{ pool: sql.ConnectionPool; error?: string }> {
  const resolved = await resolveConfiguredDatabase(databaseName);
  if (resolved.error) {
    return {
      pool: null as unknown as sql.ConnectionPool,
      error: resolved.error,
    };
  }

  return { pool: await ensureSqlConnection(resolved.databaseName) };
}

/**
 * Returns a sql.Request for the given database.
 * Resolves database name (param or default), validates against allowed list,
 * ensures connection, and returns pool.request().
 */
export async function getSqlRequest(
  databaseName?: string
): Promise<{ request: sql.Request; error?: string }> {
  const resolved = await resolveConfiguredDatabase(databaseName);
  if (resolved.error) {
    return {
      request: null as unknown as sql.Request,
      error: resolved.error,
    };
  }

  const pool = await ensureSqlConnection(resolved.databaseName);
  return { request: bindRequestCancellation(pool.request()) };
}

export async function getDedicatedSqlPool(
  databaseName?: string
): Promise<{ pool: sql.ConnectionPool; error?: string }> {
  const resolved = await resolveConfiguredDatabase(databaseName);
  if (resolved.error) {
    return {
      pool: null as unknown as sql.ConnectionPool,
      error: resolved.error,
    };
  }

  const config = {
    ...buildSqlConfig(resolved.databaseName, getSqlConnectionConfig()),
    pool: {
      max: 1,
      min: 0,
      idleTimeoutMillis: 30000,
    },
  } as sql.config;

  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  return { pool };
}
