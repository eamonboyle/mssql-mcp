import sql from "mssql";

/**
 * Turns a driver error into a message the model can act on. SQL Server
 * request errors (syntax, invalid column, permission) are returned verbatim
 * with their error number so the query can be corrected; connection-level
 * failures are summarized without driver internals.
 */
/** True when the client canceled the request (not a database failure). */
export function isCancellation(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (error instanceof sql.RequestError && error.code === "ECANCEL")
  );
}

export function describeSqlError(error: unknown): string {
  if (isCancellation(error)) {
    return "The query was canceled.";
  }

  if (error instanceof sql.RequestError) {
    if (error.code === "ETIMEOUT") {
      return "The query timed out (QUERY_TIMEOUT_MS). Narrow the query or add filters.";
    }
    const number =
      typeof error.number === "number" ? ` (SQL error ${error.number})` : "";
    return `${error.message}${number}`;
  }

  if (error instanceof sql.ConnectionError) {
    return `Could not connect to SQL Server (${error.code ?? "connection error"}).`;
  }

  if (error instanceof sql.TransactionError) {
    return `Transaction error: ${error.message}`;
  }

  return "Database query execution failed";
}
