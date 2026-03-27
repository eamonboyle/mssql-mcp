import sql from "mssql";
import { getDedicatedSqlPool } from "../db.js";
import { validateReadQuery } from "../validation.js";

interface ExplainQueryParams {
  query: string;
  databaseName?: string;
}

function extractPlanXml(recordsets: unknown): string | null {
  if (!Array.isArray(recordsets)) {
    return null;
  }

  for (const recordset of recordsets) {
    if (!Array.isArray(recordset)) {
      continue;
    }

    const firstRow = recordset[0];
    if (!firstRow || typeof firstRow !== "object") {
      continue;
    }

    const firstValue = Object.values(firstRow)[0];
    if (typeof firstValue === "string" && firstValue.trim().startsWith("<")) {
      return firstValue;
    }
  }

  return null;
}

export class ExplainQueryTool {
  name = "explain_query";
  description =
    "Returns an estimated SQL Server execution plan for a validated SELECT query without modifying data.";

  async run(params: ExplainQueryParams) {
    let pool: sql.ConnectionPool | undefined;
    let transaction: sql.Transaction | undefined;
    let transactionStarted = false;
    let showplanEnabled = false;

    try {
      const { query, databaseName } = params;
      const validation = validateReadQuery(query);
      if (!validation.isValid) {
        return {
          success: false,
          message: `Security validation failed: ${validation.error}`,
          error: "SECURITY_VALIDATION_FAILED",
        };
      }

      const { pool: dedicatedPool, error } = await getDedicatedSqlPool(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      pool = dedicatedPool;
      transaction = new sql.Transaction(pool);
      await transaction.begin();
      transactionStarted = true;

      await new sql.Request(transaction).query("SET SHOWPLAN_XML ON");
      showplanEnabled = true;

      const planResult = await new sql.Request(transaction).query(query);
      const planXml = extractPlanXml(planResult.recordsets);

      return {
        success: true,
        message: planXml
          ? "Estimated execution plan generated successfully."
          : "Execution plan request completed, but no XML plan was returned.",
        planXml,
        recordsets: planResult.recordsets,
      };
    } catch (error) {
      console.error("Error explaining query:", error);
      return {
        success: false,
        message: `Failed to explain query: ${error}`,
      };
    } finally {
      if (transaction && transactionStarted && showplanEnabled) {
        try {
          await new sql.Request(transaction).query("SET SHOWPLAN_XML OFF");
        } catch (cleanupError) {
          console.error("Failed to disable SHOWPLAN_XML:", cleanupError);
        }
      }

      if (transaction && transactionStarted) {
        try {
          await transaction.rollback();
        } catch {
          // Ignore rollback errors during cleanup.
        }
      }

      if (pool) {
        try {
          await pool.close();
        } catch {
          // Ignore pool close errors during cleanup.
        }
      }
    }
  }
}
