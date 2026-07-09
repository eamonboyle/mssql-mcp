import { clampRowLimit, getDefaultSearchLimit } from "../config.js";
import { listLargestTables, type LargestTableRow } from "../schema.js";

interface ListLargestTablesParams {
  limit?: number;
  databaseName?: string;
  schemaName?: string;
}

function formatSize(value: number): string {
  return Number.isFinite(value) ? `${value.toLocaleString()} MB` : "n/a";
}

export function formatLargestTablesText(rows: LargestTableRow[]): string {
  if (rows.length === 0) {
    return "No user tables were found.";
  }

  return rows
    .map(
      (row, index) =>
        `${index + 1}. ${row.schemaName}.${row.tableName} — ${formatSize(row.reservedMB)} reserved (${formatSize(row.usedMB)} used), ${Number(row.rowCount).toLocaleString()} row(s)`
    )
    .join("\n");
}

export class ListLargestTablesTool {
  name = "list_largest_tables";
  description =
    "Lists the largest user tables by reserved storage, including row counts and used storage. Useful for capacity discovery and identifying tables to investigate.";

  async run(params: ListLargestTablesParams = {}) {
    try {
      const limit = clampRowLimit(params.limit, getDefaultSearchLimit());
      const data = await listLargestTables(
        limit,
        params.databaseName,
        params.schemaName
      );

      return {
        success: true,
        message: `Found ${data.length} largest table(s) by reserved storage.\n\n${formatLargestTablesText(data)}`,
        data,
        limit,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to list largest tables: ${error}`,
      };
    }
  }
}
