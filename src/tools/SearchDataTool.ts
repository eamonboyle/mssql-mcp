import { clampRowLimit, getDefaultSearchLimit } from "../config.js";
import { getSqlRequest } from "../db.js";
import { buildQualifiedName, quoteIdentifier } from "../sql.js";

interface SearchDataParams {
  tableName: string;
  schemaName?: string;
  columns: string[];
  searchTerm: string;
  limit?: number;
  databaseName?: string;
}

export class SearchDataTool {
  name = "search_data";
  description =
    "Searches rows in a table by applying a parameterized LIKE filter across one or more columns.";

  async run(params: SearchDataParams) {
    try {
      const {
        tableName,
        schemaName,
        columns,
        searchTerm,
        limit,
        databaseName,
      } = params;

      if (!Array.isArray(columns) || columns.length === 0) {
        return {
          success: false,
          message: "The 'columns' field must be a non-empty array.",
        };
      }

      if (typeof searchTerm !== "string" || searchTerm.trim() === "") {
        return {
          success: false,
          message: "The 'searchTerm' field must be a non-empty string.",
        };
      }

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const qualifiedTableName = buildQualifiedName(tableName, schemaName);
      const safeColumns = columns.map((column: string) => quoteIdentifier(column));
      const top = clampRowLimit(limit, getDefaultSearchLimit());
      const whereClause = safeColumns
        .map((columnName, index) => {
          const parameterName = `search_${index}`;
          request.input(parameterName, `%${searchTerm.trim()}%`);
          return `${columnName} LIKE @${parameterName}`;
        })
        .join(" OR ");

      const query = `
        SELECT TOP (${top}) *
        FROM ${qualifiedTableName}
        WHERE ${whereClause}
      `;
      const result = await request.query(query);

      return {
        success: true,
        message: `Search completed successfully. Retrieved ${result.recordset.length} row(s).`,
        data: result.recordset,
        recordCount: result.recordset.length,
        limit: top,
      };
    } catch (error) {
      console.error("Error searching data:", error);
      return {
        success: false,
        message: `Failed to search data: ${error}`,
      };
    }
  }
}
