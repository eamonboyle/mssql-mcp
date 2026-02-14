import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getSqlRequest } from "../db.js";
import { validateReadQuery } from "../validation.js";

export class ReadDataTool implements Tool {
  [key: string]: any;
  name = "read_data";
  description =
    "Executes a SELECT query on an MSSQL Database table. The query must start with SELECT and cannot contain any destructive SQL operations for security reasons.";

  inputSchema = {
    type: "object",
    properties: {
      query: {
        type: "string",
        description:
          "SQL SELECT query to execute (must start with SELECT and cannot contain destructive operations). Example: SELECT * FROM movies WHERE genre = 'comedy'",
      },
      databaseName: {
        type: "string",
        description:
          "Name of the database to query (optional). Omit to use the default database.",
      },
    },
    required: ["query"],
  } as any;

  /**
   * Sanitizes the query result to prevent any potential security issues
   * @param data The query result data
   * @returns Sanitized data
   */
  private sanitizeResult(data: any[]): any[] {
    if (!Array.isArray(data)) {
      return [];
    }

    // Limit the number of returned records to prevent memory issues
    const maxRecords = 10000;
    if (data.length > maxRecords) {
      console.warn(
        `Query returned ${data.length} records, limiting to ${maxRecords}`
      );
      return data.slice(0, maxRecords);
    }

    return data.map((record) => {
      if (typeof record === "object" && record !== null) {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(record)) {
          // Sanitize column names (remove any suspicious characters)
          const sanitizedKey = key.replace(/[^\w\s-_.]/g, "");
          if (sanitizedKey !== key) {
            console.warn(`Column name sanitized: ${key} -> ${sanitizedKey}`);
          }
          sanitized[sanitizedKey] = value;
        }
        return sanitized;
      }
      return record;
    });
  }

  /**
   * Executes the validated SQL query
   * @param params Query parameters
   * @returns Query execution result
   */
  async run(params: any) {
    try {
      const { query, databaseName } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error, error: "INVALID_DATABASE" };
      }

      // Validate the query for security issues
      const validation = validateReadQuery(query);
      if (!validation.isValid) {
        console.warn(
          `Security validation failed for query: ${query.substring(0, 100)}...`
        );
        return {
          success: false,
          message: `Security validation failed: ${validation.error}`,
          error: "SECURITY_VALIDATION_FAILED",
        };
      }

      // Log the query for audit purposes (in production, consider more secure logging)
      console.log(
        `Executing validated SELECT query: ${query.substring(0, 200)}${query.length > 200 ? "..." : ""}`
      );

      // Execute the query
      const result = await request.query(query);

      // Sanitize the result
      const sanitizedData = this.sanitizeResult(result.recordset);

      return {
        success: true,
        message: `Query executed successfully. Retrieved ${sanitizedData.length} record(s)${
          result.recordset.length !== sanitizedData.length
            ? ` (limited from ${result.recordset.length} total records)`
            : ""
        }`,
        data: sanitizedData,
        recordCount: sanitizedData.length,
        totalRecords: result.recordset.length,
      };
    } catch (error) {
      console.error("Error executing query:", error);

      // Don't expose internal error details to prevent information leakage
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      const safeErrorMessage = errorMessage.includes("Invalid object name")
        ? errorMessage
        : "Database query execution failed";

      return {
        success: false,
        message: `Failed to execute query: ${safeErrorMessage}`,
        error: "QUERY_EXECUTION_FAILED",
      };
    }
  }
}
