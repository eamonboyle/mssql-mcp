import { getSqlRequest } from "./db.js";
import { buildQualifiedName } from "./sql.js";
import { buildParameterizedWhereClause, type SqlFilter } from "./writeSafety.js";

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

  request.input("previewLimit", limit);
  const whereClause = buildParameterizedWhereClause(
    filters,
    (name, value) => request.input(name, value),
    "preview_filter"
  );
  const tableRef = buildQualifiedName(tableName, schemaName);
  const query = `SELECT TOP (@previewLimit) * FROM ${tableRef} WHERE ${whereClause}`;
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
