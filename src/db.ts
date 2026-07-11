import sql from "mssql";
import {
  type EnvironmentConfig,
  parseDatabaseList,
  parseEnvironmentConfig,
} from "./config.js";

// Connection pools keyed by database name
const sqlPools = new Map<string, sql.ConnectionPool>();

export function getDefaultDatabaseName(): string | null {
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

export function buildSqlConfig(
  databaseName: string,
  environment: EnvironmentConfig
): sql.config {
  const config: sql.config = {
    server: environment.serverName,
    database: databaseName,
    user: environment.dbUser,
    password: environment.dbPassword,
    requestTimeout: environment.queryTimeoutMs,
    options: {
      encrypt: false,
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

  if (existing) {
    try {
      await existing.close();
    } catch {
      // Ignore close errors
    }
    sqlPools.delete(databaseName);
  }

  const config = buildSqlConfig(databaseName, parseEnvironmentConfig());
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  sqlPools.set(databaseName, pool);
  return pool;
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
  return { request: pool.request() };
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
    ...buildSqlConfig(resolved.databaseName, parseEnvironmentConfig()),
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
