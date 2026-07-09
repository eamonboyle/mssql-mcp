import sql from "mssql";
import {
  getAllowedDatabases,
  getDefaultDatabaseName,
  getSqlRequest,
} from "./db.js";
import { getFriendlyObjectType, getObjectTypeCodes } from "./sql.js";

export interface DatabaseObjectSummary {
  name: string;
  schemaName: string;
  objectType: string;
  typeCode: string;
  typeDescription: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface DatabaseObjectDescription {
  name: string;
  schemaName: string;
  objectType: string;
  typeCode: string;
  typeDescription: string;
  createdAt: Date;
  modifiedAt: Date;
  definition?: string | null;
  columns: Array<{
    name: string;
    dataType: string;
    maxLength: number;
    precision: number;
    scale: number;
    isNullable: boolean;
    isIdentity: boolean;
    defaultValue: string | null;
  }>;
  indexes: Array<{
    name: string;
    type: string;
    isUnique: boolean;
    columns: string[];
  }>;
}

export async function listDatabaseTables(
  databaseName?: string,
  schemaName?: string
) {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName ? "AND TABLE_SCHEMA = @schemaName" : "";
  const result = await request.query(`
    SELECT
      TABLE_SCHEMA AS schemaName,
      TABLE_NAME AS tableName
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
      ${schemaFilter}
    ORDER BY TABLE_SCHEMA, TABLE_NAME
  `);

  return result.recordset;
}

export async function describeTableSchema(
  tableName: string,
  databaseName?: string,
  schemaName?: string
) {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  request.input("tableName", sql.NVarChar, tableName);
  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName ? "AND c.TABLE_SCHEMA = @schemaName" : "";
  const result = await request.query(`
    SELECT
      c.TABLE_SCHEMA AS schemaName,
      c.COLUMN_NAME AS name,
      c.DATA_TYPE AS type,
      c.IS_NULLABLE AS isNullable,
      c.COLUMN_DEFAULT AS defaultValue,
      c.CHARACTER_MAXIMUM_LENGTH AS maxLength,
      c.NUMERIC_PRECISION AS numericPrecision,
      c.NUMERIC_SCALE AS numericScale
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_NAME = @tableName
      ${schemaFilter}
    ORDER BY c.ORDINAL_POSITION
  `);

  return result.recordset;
}

export async function listDatabaseObjects(
  databaseName?: string,
  objectTypes?: string[],
  schemaName?: string
): Promise<DatabaseObjectSummary[]> {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  const typeCodes = getObjectTypeCodes(objectTypes);
  const typePlaceholders = typeCodes
    .map((code, index) => {
      const parameterName = `typeCode${index}`;
      request.input(parameterName, sql.NVarChar, code);
      return `@${parameterName}`;
    })
    .join(", ");

  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName ? "AND s.name = @schemaName" : "";
  const result = await request.query(`
    SELECT
      o.name,
      s.name AS schemaName,
      o.type AS typeCode,
      o.type_desc AS typeDescription,
      o.create_date AS createdAt,
      o.modify_date AS modifiedAt
    FROM sys.objects o
    INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
    WHERE o.is_ms_shipped = 0
      AND o.type IN (${typePlaceholders})
      ${schemaFilter}
    ORDER BY s.name, o.name
  `);

  return result.recordset.map((row) => ({
    ...row,
    objectType: getFriendlyObjectType(row.typeCode),
  }));
}

export async function describeDatabaseObject(
  objectName: string,
  databaseName?: string,
  schemaName?: string,
  objectTypes?: string[]
): Promise<DatabaseObjectDescription | null> {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  request.input("objectName", sql.NVarChar, objectName);
  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  let typeFilter = "";
  if (objectTypes && objectTypes.length > 0) {
    const typeCodes = getObjectTypeCodes(objectTypes);
    const typePlaceholders = typeCodes
      .map((code, index) => {
        const parameterName = `describeTypeCode${index}`;
        request.input(parameterName, sql.NVarChar, code);
        return `@${parameterName}`;
      })
      .join(", ");

    typeFilter = `AND o.type IN (${typePlaceholders})`;
  }

  const schemaFilter = schemaName ? "AND s.name = @schemaName" : "";
  const objectResult = await request.query(`
    SELECT TOP (2)
      o.object_id AS objectId,
      o.name,
      s.name AS schemaName,
      o.type AS typeCode,
      o.type_desc AS typeDescription,
      o.create_date AS createdAt,
      o.modify_date AS modifiedAt,
      sm.definition
    FROM sys.objects o
    INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
    LEFT JOIN sys.sql_modules sm ON sm.object_id = o.object_id
    WHERE o.is_ms_shipped = 0
      AND o.name = @objectName
      ${schemaFilter}
      ${typeFilter}
    ORDER BY s.name, o.type, o.name
  `);

  const objectRows = objectResult.recordset;
  if (objectRows.length > 1) {
    const matches = objectRows
      .map(
        (row) =>
          `${row.schemaName}.${row.name} (${getFriendlyObjectType(row.typeCode)})`
      )
      .join(", ");
    throw new Error(
      `Multiple objects named '${objectName}' matched the request. Specify schemaName or objectTypes to disambiguate. Matches: ${matches}.`
    );
  }

  const objectRow = objectRows[0];
  if (!objectRow) {
    return null;
  }

  request.input("objectId", sql.Int, objectRow.objectId);

  const detailsResult = await request.query(`
    SELECT
      c.name,
      t.name AS dataType,
      c.max_length AS maxLength,
      c.precision,
      c.scale,
      c.is_nullable AS isNullable,
      c.is_identity AS isIdentity,
      dc.definition AS defaultValue
    FROM sys.columns c
    INNER JOIN sys.types t ON t.user_type_id = c.user_type_id
    LEFT JOIN sys.default_constraints dc
      ON dc.parent_object_id = c.object_id
      AND dc.parent_column_id = c.column_id
    WHERE c.object_id = @objectId
    ORDER BY c.column_id;

    SELECT
      i.name,
      i.type_desc AS type,
      i.is_unique AS isUnique,
      c.name AS columnName,
      ic.key_ordinal AS keyOrdinal
    FROM sys.indexes i
    INNER JOIN sys.index_columns ic
      ON ic.object_id = i.object_id
      AND ic.index_id = i.index_id
    INNER JOIN sys.columns c
      ON c.object_id = ic.object_id
      AND c.column_id = ic.column_id
    WHERE i.object_id = @objectId
      AND i.is_hypothetical = 0
      AND i.name IS NOT NULL
    ORDER BY i.name, ic.key_ordinal
  `);
  const detailRecordsets = Array.isArray(detailsResult.recordsets)
    ? detailsResult.recordsets
    : [];
  const columnsRecordset = (Array.isArray(detailRecordsets[0])
    ? detailRecordsets[0]
    : []) as DatabaseObjectDescription["columns"];
  const indexesRecordset = (Array.isArray(detailRecordsets[1])
    ? detailRecordsets[1]
    : []) as Array<{
    name: string;
    type: string;
    isUnique: boolean;
    columnName: string;
    keyOrdinal: number;
  }>;

  const indexes = new Map<
    string,
    { name: string; type: string; isUnique: boolean; columns: string[] }
  >();

  for (const row of indexesRecordset) {
    if (!indexes.has(row.name)) {
      indexes.set(row.name, {
        name: row.name,
        type: row.type,
        isUnique: row.isUnique,
        columns: [],
      });
    }

    indexes.get(row.name)?.columns.push(row.columnName);
  }

  return {
    name: objectRow.name,
    schemaName: objectRow.schemaName,
    objectType: getFriendlyObjectType(objectRow.typeCode),
    typeCode: objectRow.typeCode,
    typeDescription: objectRow.typeDescription,
    createdAt: objectRow.createdAt,
    modifiedAt: objectRow.modifiedAt,
    definition: objectRow.definition,
    columns: columnsRecordset,
    indexes: [...indexes.values()],
  };
}

export function listConfiguredDatabases() {
  const defaultName = getDefaultDatabaseName();
  return getAllowedDatabases().map((name) => ({
    name,
    isDefault: defaultName === name,
  }));
}

export type SchemaObjectCountRow = {
  objectType: string;
  objectCount: number;
};

export type SchemaCountRow = {
  schemaName: string;
  objectCount: number;
};

export type SchemaSummaryResult = {
  objectCounts: SchemaObjectCountRow[];
  schemaCounts: SchemaCountRow[];
};

export async function getDatabaseSchemaSummary(
  databaseName?: string
): Promise<SchemaSummaryResult> {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  const result = await request.query(`
    SELECT
      CASE
        WHEN o.type = 'U' THEN 'table'
        WHEN o.type = 'V' THEN 'view'
        WHEN o.type = 'P' THEN 'procedure'
        WHEN o.type IN ('FN', 'IF', 'TF', 'FS', 'FT') THEN 'function'
        WHEN o.type = 'TR' THEN 'trigger'
        ELSE 'other'
      END AS objectType,
      COUNT(*) AS objectCount
    FROM sys.objects o
    WHERE o.is_ms_shipped = 0
    GROUP BY CASE
      WHEN o.type = 'U' THEN 'table'
      WHEN o.type = 'V' THEN 'view'
      WHEN o.type = 'P' THEN 'procedure'
      WHEN o.type IN ('FN', 'IF', 'TF', 'FS', 'FT') THEN 'function'
      WHEN o.type = 'TR' THEN 'trigger'
      ELSE 'other'
    END;

    SELECT
      s.name AS schemaName,
      COUNT(*) AS objectCount
    FROM sys.objects o
    INNER JOIN sys.schemas s ON s.schema_id = o.schema_id
    WHERE o.is_ms_shipped = 0
    GROUP BY s.name
    ORDER BY objectCount DESC, s.name;
  `);

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  return {
    objectCounts: recordsets[0] ?? [],
    schemaCounts: recordsets[1] ?? [],
  } satisfies SchemaSummaryResult;
}

export async function listForeignKeys(databaseName?: string, schemaName?: string) {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName
    ? "AND (ps.name = @schemaName OR rs.name = @schemaName)"
    : "";
  const result = await request.query(`
    SELECT
      fk.name AS foreignKeyName,
      ps.name AS parentSchemaName,
      pt.name AS parentTableName,
      pc.name AS parentColumnName,
      rs.name AS referencedSchemaName,
      rt.name AS referencedTableName,
      rc.name AS referencedColumnName,
      fk.delete_referential_action_desc AS onDelete,
      fk.update_referential_action_desc AS onUpdate
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc
      ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.tables pt
      ON pt.object_id = fk.parent_object_id
    INNER JOIN sys.schemas ps
      ON ps.schema_id = pt.schema_id
    INNER JOIN sys.columns pc
      ON pc.object_id = pt.object_id
      AND pc.column_id = fkc.parent_column_id
    INNER JOIN sys.tables rt
      ON rt.object_id = fk.referenced_object_id
    INNER JOIN sys.schemas rs
      ON rs.schema_id = rt.schema_id
    INNER JOIN sys.columns rc
      ON rc.object_id = rt.object_id
      AND rc.column_id = fkc.referenced_column_id
    WHERE 1 = 1
      ${schemaFilter}
    ORDER BY ps.name, pt.name, fk.name, fkc.constraint_column_id
  `);

  return result.recordset;
}

export async function describeRelationships(
  tableName: string,
  databaseName?: string,
  schemaName?: string
) {
  const foreignKeys = await listForeignKeys(databaseName, schemaName);
  return foreignKeys.filter(
    (row) =>
      row.parentTableName === tableName || row.referencedTableName === tableName
  );
}

export async function describeObjectDependencies(
  objectName: string,
  databaseName?: string,
  schemaName?: string
) {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  request.input("objectName", sql.NVarChar, objectName);
  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName ? "AND s.name = @schemaName" : "";
  const result = await request.query(`
    SELECT
      referencingSchema.name AS referencingSchemaName,
      referencing.name AS referencingObjectName,
      referencing.type_desc AS referencingType,
      referenced.referenced_schema_name AS referencedSchemaName,
      referenced.referenced_entity_name AS referencedEntityName
    FROM sys.objects target
    INNER JOIN sys.schemas s ON s.schema_id = target.schema_id
    INNER JOIN sys.sql_expression_dependencies referenced
      ON referenced.referenced_id = target.object_id
    INNER JOIN sys.objects referencing
      ON referencing.object_id = referenced.referencing_id
    INNER JOIN sys.schemas referencingSchema
      ON referencingSchema.schema_id = referencing.schema_id
    WHERE target.name = @objectName
      ${schemaFilter}
    ORDER BY referencingSchema.name, referencing.name;
  `);

  return result.recordset;
}

export interface AnalyzeTableResult {
  summary: Record<string, unknown> | null;
  indexes: Array<Record<string, unknown>>;
}

export async function analyzeTable(
  tableName: string,
  databaseName?: string,
  schemaName?: string
): Promise<AnalyzeTableResult> {
  const { request, error } = await getSqlRequest(databaseName);
  if (error) {
    throw new Error(error);
  }

  request.input("tableName", sql.NVarChar, tableName);
  if (schemaName) {
    request.input("schemaName", sql.NVarChar, schemaName);
  }

  const schemaFilter = schemaName ? "AND s.name = @schemaName" : "";
  const result = await request.query(`
    SELECT TOP (1)
      s.name AS schemaName,
      t.name AS tableName,
      SUM(p.row_count) AS [rowCount],
      CAST(SUM(a.total_pages) * 8.0 / 1024 AS DECIMAL(12, 2)) AS reservedMB,
      CAST(SUM(a.used_pages) * 8.0 / 1024 AS DECIMAL(12, 2)) AS usedMB
    FROM sys.tables t
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    INNER JOIN sys.dm_db_partition_stats p ON p.object_id = t.object_id
    INNER JOIN sys.partitions sp ON sp.partition_id = p.partition_id
    INNER JOIN sys.allocation_units a ON a.container_id = sp.hobt_id
    WHERE t.name = @tableName
      ${schemaFilter}
    GROUP BY s.name, t.name
    ORDER BY s.name, t.name;

    SELECT
      i.name,
      i.type_desc AS type,
      i.is_unique AS isUnique,
      i.is_primary_key AS isPrimaryKey
    FROM sys.indexes i
    INNER JOIN sys.tables t ON t.object_id = i.object_id
    INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = @tableName
      ${schemaFilter}
      AND i.index_id > 0
    ORDER BY i.name;
  `);

  const recordsets = Array.isArray(result.recordsets) ? result.recordsets : [];
  const rawRows = recordsets[1];
  const indexes =
    rawRows !== undefined && rawRows !== null
      ? Array.from(rawRows as Iterable<Record<string, unknown>>)
      : [];

  return {
    summary: (recordsets[0]?.[0] as Record<string, unknown> | undefined) ?? null,
    indexes,
  };
}
