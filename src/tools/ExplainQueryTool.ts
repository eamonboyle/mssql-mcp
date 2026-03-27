import sql from "mssql";
import { getDedicatedSqlPool } from "../db.js";
import { validateReadQuery } from "../validation.js";

interface ExplainQueryParams {
  query: string;
  databaseName?: string;
}

function cellLooksLikeShowPlanXml(value: unknown): string | null {
  if (typeof value === "string" && value.trimStart().startsWith("<")) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    const s = value.toString("utf16le").trimStart();
    if (s.startsWith("<")) {
      return s;
    }
  }
  return null;
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

    for (const value of Object.values(firstRow)) {
      const xml = cellLooksLikeShowPlanXml(value);
      if (xml) {
        return xml;
      }
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

      // Same pattern as SSMS: separate batches on one session, no explicit transaction.
      // BEGIN TRANSACTION can prevent SHOWPLAN_XML from affecting the following SELECT.
      // Use batch() so batches go through execSqlBatch (closer to SSMS client batch boundaries).
      await pool.request().batch("SET SHOWPLAN_XML ON");
      showplanEnabled = true;

      const planResult = await pool.request().batch(query);
      const planXml = extractPlanXml(planResult.recordsets);

      return {
        success: true,
        message: planXml
          ? "Estimated execution plan generated successfully."
          : "Execution plan request completed, but no XML plan was returned.",
        planXml,
        recordsets: planXml ? undefined : planResult.recordsets,
      };
    } catch (error) {
      console.error("Error explaining query:", error);
      return {
        success: false,
        message: `Failed to explain query: ${error}`,
      };
    } finally {
      if (pool && showplanEnabled) {
        try {
          await pool.request().batch("SET SHOWPLAN_XML OFF");
        } catch (cleanupError) {
          console.error("Failed to disable SHOWPLAN_XML:", cleanupError);
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
