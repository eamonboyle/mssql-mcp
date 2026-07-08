import { clampRowLimit, getDefaultSearchLimit } from "../config.js";
import { getSqlRequest } from "../db.js";
import { buildQualifiedName, quoteIdentifier } from "../sql.js";
import {
  buildParameterizedWhereClause,
  type SqlFilter,
} from "../writeSafety.js";

export interface FilterOrderBy {
  column: string;
  direction?: "ASC" | "DESC";
}

interface FilterDataParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  columns?: string[];
  orderBy?: FilterOrderBy[];
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

      if (!Array.isArray(filters) || filters.length === 0) {
        return {
          success: false,
          message: "At least one filter is required.",
        };
      }

      const resolvedOffset =
        offset === undefined || offset === null ? 0 : Number(offset);
      if (
        !Number.isFinite(resolvedOffset) ||
        !Number.isInteger(resolvedOffset) ||
        resolvedOffset < 0
      ) {
        return {
          success: false,
          message: "The 'offset' field must be a non-negative integer.",
        };
      }

      if (resolvedOffset > 0 && (!Array.isArray(orderBy) || orderBy.length === 0)) {
        return {
          success: false,
          message:
            "When 'offset' is greater than 0, 'orderBy' is required (SQL Server OFFSET/FETCH).",
        };
      }

      const { request, error } = await getSqlRequest(databaseName);
      if (error) {
        return { success: false, message: error };
      }

      const selectList =
        Array.isArray(columns) && columns.length > 0
          ? columns.map((column) => quoteIdentifier(column)).join(", ")
          : "*";

      const whereClause = buildParameterizedWhereClause(
        filters,
        (name, value) => request.input(name, value),
        "filter_data"
      );

      let orderByClause = "";
      if (Array.isArray(orderBy) && orderBy.length > 0) {
        const parts = orderBy.map((entry) => {
          const direction =
            entry.direction === "DESC"
              ? "DESC"
              : entry.direction === "ASC" || entry.direction === undefined
                ? "ASC"
                : null;
          if (direction === null) {
            throw new Error(
              `Invalid orderBy direction '${String(entry.direction)}'. Use ASC or DESC.`
            );
          }
          return `${quoteIdentifier(entry.column)} ${direction}`;
        });
        orderByClause = ` ORDER BY ${parts.join(", ")}`;
      }

      const top = clampRowLimit(limit, getDefaultSearchLimit());
      const tableRef = buildQualifiedName(tableName, schemaName);

      let query: string;
      if (resolvedOffset > 0) {
        request.input("filter_offset", resolvedOffset);
        request.input("filter_limit", top);
        query = `SELECT ${selectList} FROM ${tableRef} WHERE ${whereClause}${orderByClause} OFFSET @filter_offset ROWS FETCH NEXT @filter_limit ROWS ONLY`;
      } else {
        request.input("filter_limit", top);
        query = `SELECT TOP (@filter_limit) ${selectList} FROM ${tableRef} WHERE ${whereClause}${orderByClause}`;
      }

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
