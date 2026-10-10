import sql from "mssql";
import { getMaxRows } from "../config.js";
import { bindRequestCancellation, getSqlPool } from "../db.js";
import { describeSqlError, isCancellation } from "../sqlErrors.js";
import { validateReadQuery } from "../validation.js";

interface ReadDataParams {
  query: string;
  databaseName?: string;
}

interface StreamedRows {
  rows: Record<string, unknown>[];
  truncated: boolean;
}

/**
 * Streams a query and stops reading once `maxRows` rows have arrived, so a
 * large result is never fully buffered in memory.
 */
export function streamRows(
  request: sql.Request,
  query: string,
  maxRows: number
): Promise<StreamedRows> {
  return new Promise((resolve, reject) => {
    const rows: Record<string, unknown>[] = [];
    let truncated = false;
    let failure: unknown;

    request.stream = true;
    request.on("row", (row: Record<string, unknown>) => {
      if (rows.length < maxRows) {
        rows.push(row);
        return;
      }
      if (!truncated) {
        // One row past the limit proves there is more data; stop the server.
        truncated = true;
        request.cancel();
      }
    });
    request.on("error", (error: unknown) => {
      // Our own cancel surfaces as ECANCEL; the rows read so far are valid.
      if (truncated && (error as { code?: string })?.code === "ECANCEL") {
        return;
      }
      failure ??= error;
    });
    // Settle only on "done": until then the request still owns the
    // connection, and rolling back the transaction would fail and leak it.
    request.on("done", () =>
      failure ? reject(failure) : resolve({ rows, truncated })
    );
    // Callback form: in stream mode errors arrive via the "error" event, and
    // the promise form would otherwise reject unobserved.
    request.query(query, () => undefined);
  });
}

export class ReadDataTool {
  name = "read_data";
  description =
    "Executes a read-only SELECT query (CTEs with WITH are allowed) on an MSSQL database. Only a single SELECT statement is accepted, and it runs inside a transaction that is always rolled back.";

  /**
   * Removes unexpected characters from column names in the result.
   */
  private sanitizeColumnNames(
    rows: Record<string, unknown>[]
  ): Record<string, unknown>[] {
    return rows.map((record) => {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        const sanitizedKey = key.replace(/[^\w\s-_.]/g, "");
        if (sanitizedKey !== key) {
          console.error(`Column name sanitized: ${key} -> ${sanitizedKey}`);
        }
        sanitized[sanitizedKey] = value;
      }
      return sanitized;
    });
  }

  async run(params: ReadDataParams) {
    const { query, databaseName } = params;

    const validation = validateReadQuery(query);
    if (!validation.isValid) {
      console.error(
        `Security validation failed for query: ${query?.substring?.(0, 100)}...`
      );
      return {
        success: false,
        message: `Security validation failed: ${validation.error}`,
        error: "SECURITY_VALIDATION_FAILED",
      };
    }

    let transaction: sql.Transaction | undefined;
    try {
      const { pool, error } = await getSqlPool(databaseName);
      if (error) {
        return { success: false, message: error, error: "INVALID_DATABASE" };
      }

      // Audit on stderr only — stdout must stay JSON-RPC for MCP stdio transport.
      console.error(
        `Executing validated SELECT query: ${query.substring(0, 200)}${query.length > 200 ? "..." : ""}`
      );

      // Defense in depth: anything that slipped past validation is undone.
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      const request = bindRequestCancellation(new sql.Request(transaction));

      const maxRows = getMaxRows();
      const { rows, truncated } = await streamRows(request, query, maxRows);
      const data = this.sanitizeColumnNames(rows);

      return {
        success: true,
        message: truncated
          ? `Query executed successfully. Returned the first ${data.length} record(s); more rows exist beyond MAX_ROWS (${maxRows}). Add TOP, WHERE, or OFFSET/FETCH to narrow the result.`
          : `Query executed successfully. Retrieved ${data.length} record(s)`,
        data,
        recordCount: data.length,
        truncated,
      };
    } catch (error) {
      if (isCancellation(error)) {
        console.error("Query canceled by the client.");
      } else {
        console.error("Error executing query:", error);
      }
      return {
        success: false,
        message: `Failed to execute query: ${describeSqlError(error)}`,
        error: "QUERY_EXECUTION_FAILED",
      };
    } finally {
      await transaction?.rollback().catch(() => undefined);
    }
  }
}
