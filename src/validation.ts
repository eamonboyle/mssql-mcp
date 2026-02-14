/**
 * SQL query validation for read-only operations.
 * Extracted for testability and reuse.
 */

const DANGEROUS_KEYWORDS = [
  "DELETE",
  "DROP",
  "UPDATE",
  "INSERT",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "EXEC",
  "EXECUTE",
  "MERGE",
  "REPLACE",
  "GRANT",
  "REVOKE",
  "COMMIT",
  "ROLLBACK",
  "TRANSACTION",
  "BEGIN",
  "DECLARE",
  "SET",
  "USE",
  "BACKUP",
  "RESTORE",
  "KILL",
  "SHUTDOWN",
  "WAITFOR",
  "OPENROWSET",
  "OPENDATASOURCE",
  "OPENQUERY",
  "OPENXML",
  "BULK",
  "INTO",
];

const DANGEROUS_PATTERNS = [
  /SELECT\s+.*?\s+INTO\s+/i,
  /;\s*(DELETE|DROP|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE|MERGE|REPLACE|GRANT|REVOKE)/i,
  /UNION\s+(?:ALL\s+)?SELECT.*?(DELETE|DROP|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)/i,
  /--.*?(DELETE|DROP|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)/i,
  /\/\*.*?(DELETE|DROP|UPDATE|INSERT|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE).*?\*\//i,
  /EXEC\s*\(/i,
  /EXECUTE\s*\(/i,
  /sp_/i,
  /xp_/i,
  /BULK\s+INSERT/i,
  /OPENROWSET/i,
  /OPENDATASOURCE/i,
  /@@/,
  /SYSTEM_USER/i,
  /USER_NAME/i,
  /DB_NAME/i,
  /HOST_NAME/i,
  /WAITFOR\s+DELAY/i,
  /WAITFOR\s+TIME/i,
  /;\s*\w/,
  /\+\s*CHAR\s*\(/i,
  /\+\s*NCHAR\s*\(/i,
  /\+\s*ASCII\s*\(/i,
];

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a SQL query for read-only (SELECT) operations.
 * Rejects dangerous keywords, injection patterns, and multi-statement queries.
 */
export function validateReadQuery(query: string): ValidationResult {
  if (!query || typeof query !== "string") {
    return {
      isValid: false,
      error: "Query must be a non-empty string",
    };
  }

  const cleanQuery = query
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleanQuery) {
    return {
      isValid: false,
      error: "Query cannot be empty after removing comments",
    };
  }

  const upperQuery = cleanQuery.toUpperCase();

  if (!upperQuery.startsWith("SELECT")) {
    return {
      isValid: false,
      error: "Query must start with SELECT for security reasons",
    };
  }

  for (const keyword of DANGEROUS_KEYWORDS) {
    const keywordRegex = new RegExp(
      `(^|\\s|[^A-Za-z0-9_])${keyword}($|\\s|[^A-Za-z0-9_])`,
      "i"
    );
    if (keywordRegex.test(upperQuery)) {
      return {
        isValid: false,
        error: `Dangerous keyword '${keyword}' detected in query. Only SELECT operations are allowed.`,
      };
    }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(query)) {
      return {
        isValid: false,
        error:
          "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.",
      };
    }
  }

  const statements = cleanQuery
    .split(";")
    .filter((stmt) => stmt.trim().length > 0);
  if (statements.length > 1) {
    return {
      isValid: false,
      error:
        "Multiple SQL statements are not allowed. Use only a single SELECT statement.",
    };
  }

  if (
    query.includes("CHAR(") ||
    query.includes("NCHAR(") ||
    query.includes("ASCII(")
  ) {
    return {
      isValid: false,
      error:
        "Character conversion functions are not allowed as they may be used for obfuscation.",
    };
  }

  if (query.length > 10000) {
    return {
      isValid: false,
      error: "Query is too long. Maximum allowed length is 10,000 characters.",
    };
  }

  return { isValid: true };
}
