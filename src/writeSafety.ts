import { quoteIdentifier } from "./sql.js";

export const SQL_FILTER_OPERATORS = [
  "=",
  "!=",
  ">",
  ">=",
  "<",
  "<=",
  "LIKE",
  "IN",
  "IS NULL",
  "IS NOT NULL",
] as const;
const FILTER_OPERATOR_SET = new Set<string>(SQL_FILTER_OPERATORS);

export type SqlFilterOperator = (typeof SQL_FILTER_OPERATORS)[number];

export interface SqlFilter {
  column: string;
  operator: SqlFilterOperator;
  value?: unknown;
  values?: unknown[];
}

export interface SqlTypeDeclaration {
  type: string;
  nullable?: boolean;
  isPrimaryKey?: boolean;
  isUnique?: boolean;
  isIdentity?: boolean;
  identitySeed?: number;
  identityIncrement?: number;
}

const LENGTH_TYPES = new Set([
  "binary",
  "char",
  "nchar",
  "nvarchar",
  "varbinary",
  "varchar",
]);

const PRECISION_SCALE_TYPES = new Set(["decimal", "numeric"]);
const OPTIONAL_PRECISION_TYPES = new Set(["float"]);
const OPTIONAL_SCALE_TYPES = new Set(["datetime2", "datetimeoffset", "time"]);
const SIMPLE_TYPES = new Set([
  "bigint",
  "bit",
  "date",
  "datetime",
  "image",
  "int",
  "money",
  "ntext",
  "real",
  "smalldatetime",
  "smallint",
  "smallmoney",
  "sql_variant",
  "text",
  "tinyint",
  "uniqueidentifier",
  "xml",
]);

function assertPositiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid ${label}.`);
  }
}

function normalizeTypeParameterList(typeName: string, params: string): string {
  if (LENGTH_TYPES.has(typeName)) {
    const normalized = params.trim().toUpperCase();
    if (normalized === "MAX") {
      return "(MAX)";
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid length for SQL type '${typeName}'.`);
    }

    return `(${parsed})`;
  }

  if (PRECISION_SCALE_TYPES.has(typeName)) {
    const match = params.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);
    if (!match) {
      throw new Error(`Invalid precision/scale for SQL type '${typeName}'.`);
    }

    return `(${Number.parseInt(match[1], 10)}, ${Number.parseInt(match[2], 10)})`;
  }

  if (OPTIONAL_PRECISION_TYPES.has(typeName)) {
    const parsed = Number.parseInt(params.trim(), 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid precision for SQL type '${typeName}'.`);
    }

    return `(${parsed})`;
  }

  if (OPTIONAL_SCALE_TYPES.has(typeName)) {
    const parsed = Number.parseInt(params.trim(), 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new Error(`Invalid scale for SQL type '${typeName}'.`);
    }

    return `(${parsed})`;
  }

  throw new Error(`SQL type '${typeName}' does not accept parameters.`);
}

export function normalizeSqlType(rawType: string): string {
  if (typeof rawType !== "string" || rawType.trim() === "") {
    throw new Error("Column type is required.");
  }

  const trimmed = rawType.trim();
  const match = trimmed.match(/^([A-Za-z][A-Za-z0-9_]*)(?:\(([^)]+)\))?$/);
  if (!match) {
    throw new Error(`Unsupported SQL type declaration '${rawType}'.`);
  }

  const typeName = match[1].toLowerCase();
  const rawParams = match[2];

  if (
    !LENGTH_TYPES.has(typeName) &&
    !PRECISION_SCALE_TYPES.has(typeName) &&
    !OPTIONAL_PRECISION_TYPES.has(typeName) &&
    !OPTIONAL_SCALE_TYPES.has(typeName) &&
    !SIMPLE_TYPES.has(typeName)
  ) {
    throw new Error(`Unsupported SQL type '${rawType}'.`);
  }

  if (!rawParams) {
    return typeName.toUpperCase();
  }

  return `${typeName.toUpperCase()}${normalizeTypeParameterList(typeName, rawParams)}`;
}

export function buildCreateColumnDefinition(
  columnName: string,
  declaration: SqlTypeDeclaration
): string {
  const fragments = [quoteIdentifier(columnName), normalizeSqlType(declaration.type)];

  if (declaration.isIdentity) {
    const seed = declaration.identitySeed ?? 1;
    const increment = declaration.identityIncrement ?? 1;
    assertPositiveInteger(seed, "identity seed");
    assertPositiveInteger(increment, "identity increment");
    fragments.push(`IDENTITY(${seed}, ${increment})`);
  }

  if (declaration.isPrimaryKey) {
    fragments.push("PRIMARY KEY");
  } else if (declaration.isUnique) {
    fragments.push("UNIQUE");
  }

  if (declaration.nullable === false || declaration.isPrimaryKey) {
    fragments.push("NOT NULL");
  } else if (declaration.nullable === true) {
    fragments.push("NULL");
  }

  return fragments.join(" ");
}

export function buildParameterizedWhereClause(
  filters: SqlFilter[],
  input: (name: string, value: unknown) => unknown,
  parameterPrefix = "filter"
): string {
  if (!Array.isArray(filters) || filters.length === 0) {
    throw new Error("At least one filter is required.");
  }

  return filters
    .map((filter, index) => {
      const columnName = quoteIdentifier(filter.column);
      const operator = filter.operator;
      if (!FILTER_OPERATOR_SET.has(operator)) {
        throw new Error(`Unsupported filter operator '${operator}'.`);
      }

      switch (operator) {
        case "IS NULL":
        case "IS NOT NULL":
          return `${columnName} ${operator}`;
        case "IN": {
          if (!Array.isArray(filter.values) || filter.values.length === 0) {
            throw new Error(`Filter '${filter.column}' requires a non-empty 'values' array.`);
          }

          const placeholders = filter.values.map((value, valueIndex) => {
            const parameterName = `${parameterPrefix}_${index}_${valueIndex}`;
            input(parameterName, value);
            return `@${parameterName}`;
          });

          return `${columnName} IN (${placeholders.join(", ")})`;
        }
        default: {
          if (!("value" in filter)) {
            throw new Error(`Filter '${filter.column}' requires a 'value'.`);
          }

          const parameterName = `${parameterPrefix}_${index}`;
          input(parameterName, filter.value);
          return `${columnName} ${operator} @${parameterName}`;
        }
      }
    })
    .join(" AND ");
}
