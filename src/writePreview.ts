import { getSqlRequest } from "./db.js";
import { buildFilteredReadQuery } from "./filteredRead.js";
import type { SqlFilter } from "./writeSafety.js";

export interface WritePreviewResult {
  query: string;
  countQuery: string;
  rows: unknown[];
  affectedRowCount: number;
}

export async function previewFilteredRows(params: {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  databaseName?: string;
  limit: number;
}) {
  const { tableName, schemaName, filters, databaseName, limit } = params;
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  const { query, tableRef, whereClause } = buildFilteredReadQuery(request, {
    tableName,
    schemaName,
    filters,
    limit,
    offset: 0,
    filterParamPrefix: "preview_filter",
    limitParameterName: "previewLimit",
    offsetParameterName: "preview_offset",
  });
  const countQuery = `SELECT COUNT(*) AS affectedRowCount FROM ${tableRef} WHERE ${whereClause}`;

  const result = await request.query(`
    ${query};
    ${countQuery};
  `);
  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];

  return {
    query,
    countQuery,
    rows: recordsets[0] ?? [],
    affectedRowCount: recordsets[1]?.[0]?.affectedRowCount ?? 0,
  } satisfies WritePreviewResult;
}
