import { buildQualifiedName, quoteIdentifier } from "./sql.js";
import {
  buildParameterizedWhereClause,
  type SqlFilter,
} from "./writeSafety.js";

export interface FilterOrderBy {
  column: string;
  direction?: "ASC" | "DESC";
}

export interface FilteredReadParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  columns?: string[];
  orderBy?: FilterOrderBy[];
  limit: number;
  offset?: number;
  filterParamPrefix: string;
  limitParameterName?: string;
  offsetParameterName?: string;
}

export interface SqlRequestBindings {
  input(name: string, value: unknown): void;
}

export function buildOrderByClause(orderBy?: FilterOrderBy[]): string {
  if (!orderBy?.length) {
    return "";
  }

  const parts = orderBy.map(
    (entry) => `${quoteIdentifier(entry.column)} ${entry.direction ?? "ASC"}`
  );
  return ` ORDER BY ${parts.join(", ")}`;
}

export function buildFilteredReadQuery(
  request: SqlRequestBindings,
  params: FilteredReadParams
): { query: string; tableRef: string; whereClause: string } {
  const {
    tableName,
    schemaName,
    filters,
    columns,
    orderBy,
    limit,
    offset = 0,
    filterParamPrefix,
    limitParameterName = "filter_limit",
    offsetParameterName = "filter_offset",
  } = params;

  const selectList =
    columns?.length
      ? columns.map((column) => quoteIdentifier(column)).join(", ")
      : "*";

  const whereClause = buildParameterizedWhereClause(
    filters,
    (name, value) => request.input(name, value),
    filterParamPrefix
  );
  const orderByClause = buildOrderByClause(orderBy);
  const tableRef = buildQualifiedName(tableName, schemaName);

  let query: string;
  if (offset > 0) {
    request.input(offsetParameterName, offset);
    request.input(limitParameterName, limit);
    query = `SELECT ${selectList} FROM ${tableRef} WHERE ${whereClause}${orderByClause} OFFSET @${offsetParameterName} ROWS FETCH NEXT @${limitParameterName} ROWS ONLY`;
  } else {
    request.input(limitParameterName, limit);
    query = `SELECT TOP (@${limitParameterName}) ${selectList} FROM ${tableRef} WHERE ${whereClause}${orderByClause}`;
  }

  return { query, tableRef, whereClause };
}
