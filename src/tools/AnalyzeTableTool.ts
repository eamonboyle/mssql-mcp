import { analyzeTable } from "../schema.js";

interface AnalyzeTableParams {
  tableName: string;
  schemaName?: string;
  databaseName?: string;
}

type AnalyzeRow = {
  schemaName?: unknown;
  tableName?: unknown;
  rowCount?: unknown;
  reservedMB?: unknown;
  usedMB?: unknown;
};

type IndexRow = {
  name?: unknown;
  type?: unknown;
  isUnique?: unknown;
  isPrimaryKey?: unknown;
};

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) {
    return "n/a";
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? String(value)
      : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return String(value);
}

/** Human-readable summary for the primary MCP text block (tabular details are also inlined as JSON when applicable). */
export function formatAnalyzeTableText(data: {
  summary: AnalyzeRow | null;
  indexes: IndexRow[];
}): string {
  const s = data.summary;
  if (!s) {
    return "";
  }

  const schema = formatScalar(s.schemaName);
  const table = formatScalar(s.tableName);
  const lines: string[] = [
    `Table: ${schema}.${table}`,
    `Estimated rows: ${formatScalar(s.rowCount)}`,
    `Reserved: ${formatScalar(s.reservedMB)} MB`,
    `Used: ${formatScalar(s.usedMB)} MB`,
    "",
    "Indexes:",
  ];

  if (data.indexes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const idx of data.indexes) {
      const name = idx.name != null ? formatScalar(idx.name) : "(unnamed)";
      const type = idx.type != null ? formatScalar(idx.type) : "?";
      const tags: string[] = [];
      if (idx.isPrimaryKey === true || idx.isPrimaryKey === 1) {
        tags.push("primary key");
      }
      if (idx.isUnique === true || idx.isUnique === 1) {
        tags.push("unique");
      }
      const tagPart = tags.length > 0 ? ` (${tags.join(", ")})` : "";
      lines.push(`  - ${name}: ${type}${tagPart}`);
    }
  }

  return lines.join("\n");
}

export class AnalyzeTableTool {
  name = "analyze_table";
  description =
    "Summarizes row counts, storage, and indexes for a table.";

  async run(params: AnalyzeTableParams) {
    try {
      const data = await analyzeTable(
        params.tableName,
        params.databaseName,
        params.schemaName
      );

      if (!data.summary) {
        return {
          success: true,
          message: `No table named '${params.tableName}' was found.`,
          data,
        };
      }

      const detail = formatAnalyzeTableText(data);
      return {
        success: true,
        message: `Analyzed ${params.tableName} successfully.\n\n${detail}`,
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to analyze table: ${error}`,
      };
    }
  }
}
