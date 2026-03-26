import { getSqlRequest } from "../db.js";
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

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const planBatch = `SET SHOWPLAN_XML ON; ${query}; SET SHOWPLAN_XML OFF;`;
      const batchResult =
        typeof request.batch === "function"
          ? await request.batch(planBatch)
          : await request.query(planBatch);
      const planXml = extractPlanXml(batchResult.recordsets);

      return {
        success: true,
        message: planXml
          ? "Estimated execution plan generated successfully."
          : "Execution plan request completed, but no XML plan was returned.",
        planXml,
        recordsets: batchResult.recordsets,
      };
    } catch (error) {
      console.error("Error explaining query:", error);
      return {
        success: false,
        message: `Failed to explain query: ${error}`,
      };
    }
  }
}
