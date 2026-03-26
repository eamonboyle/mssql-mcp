import sql from "mssql";

// Connection pools keyed by database name
const sqlPools = new Map<string, sql.ConnectionPool>();

function parseDatabaseList(value?: string): string[] {
  if (!value || !value.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((db) => db.trim())
    .filter(Boolean);
}

function getDefaultDatabaseName(): string | null {
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

function createSqlConfigForDatabase(databaseName: string): sql.config {
  const trustServerCertificate =
    process.env.TRUST_SERVER_CERTIFICATE?.toLowerCase() === "true";
  const connectionTimeout = process.env.CONNECTION_TIMEOUT
    ? parseInt(process.env.CONNECTION_TIMEOUT, 10)
    : 30;

  return {
    server: process.env.SERVER_NAME || "localhost",
    database: databaseName,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
      encrypt: false,
      trustServerCertificate: trustServerCertificate || true,
      enableArithAbort: true,
      useUTC: false,
    },
    connectionTimeout: connectionTimeout * 1000,
  } as sql.config;
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

  const config = createSqlConfigForDatabase(databaseName);
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
  const resolved = resolveDatabaseName(databaseName);
  if (!resolved) {
    const allowed = getAllowedDatabases();
    const configurationHint =
      allowed.length > 0
        ? `Allowed: ${allowed.join(", ")}.`
        : "Set DATABASE_NAME or DATABASES to configure database access.";

    return {
      request: null as any,
      error: `Invalid or disallowed database. ${configurationHint} Use the databaseName parameter to target a specific configured database.`,
    };
  }

  const pool = await ensureSqlConnection(resolved);
  return { request: pool.request() };
}
