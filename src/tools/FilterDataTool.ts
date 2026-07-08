import { clampRowLimit, getDefaultSearchLimit } from "../config.js";
import { getSqlRequest } from "../db.js";
import { buildFilteredReadQuery } from "../filteredRead.js";
import type { SqlFilter } from "../writeSafety.js";

interface FilterDataParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  columns?: string[];
  orderBy?: Array<{ column: string; direction?: "ASC" | "DESC" }>;
  limit?: number;
  offset?: number;
  databaseName?: string;
}

export class FilterDataTool {
  name = "filter_data";
  description =
    "Reads rows from a table using the same structured filter DSL as update/delete previews (AND-combined operators). Prefer this over raw SQL when filtering by known columns. Supports optional column projection, ORDER BY, limit, and offset.";

  async run(params: FilterDataParams) {
    try {
      const {
        tableName,
        schemaName,
        filters,
        columns,
        orderBy,
        limit,
        offset,
        databaseName,
      } = params;

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const resolvedOffset = offset ?? 0;
      const top = clampRowLimit(limit, getDefaultSearchLimit());
      const { query } = buildFilteredReadQuery(request, {
        tableName,
        schemaName,
        filters,
        columns,
        orderBy,
        limit: top,
        offset: resolvedOffset,
        filterParamPrefix: "filter_data",
      });

      const result = await request.query(query);

      return {
        success: true,
        message: `Filter completed successfully. Retrieved ${result.recordset.length} row(s).`,
        data: result.recordset,
        recordCount: result.recordset.length,
        limit: top,
        offset: resolvedOffset,
      };
    } catch (error) {
      console.error("Error filtering data:", error);
      return {
        success: false,
        message: `Failed to filter data: ${error}`,
      };
    }
  }
}
