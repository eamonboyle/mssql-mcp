import sql from "mssql";
import { getSqlRequest } from "./db.js";
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
