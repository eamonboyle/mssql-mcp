import {
  getDatabaseSchemaSummary,
  type SchemaSummaryResult,
} from "../schema.js";

interface SummarizeSchemaParams {
  databaseName?: string;
}

export function formatSchemaSummaryText(data: SchemaSummaryResult): string {
  const typeSummary = data.objectCounts
    .map((row) => `${row.objectType}: ${row.objectCount}`)
    .join(", ");
  const schemaSummary = data.schemaCounts
    .slice(0, 10)
    .map((row) => `${row.schemaName}: ${row.objectCount}`)
    .join(", ");

  return `Schema summary: ${typeSummary || "no typed objects"}.${
    schemaSummary ? ` Top schemas: ${schemaSummary}.` : ""
  }`;
}

export class SummarizeSchemaTool {
  name = "summarize_schema";
  description =
    "Returns a high-level schema summary for a database: object counts by type and object counts per schema.";

  async run(params: SummarizeSchemaParams = {}) {
    try {
      const data = await getDatabaseSchemaSummary(params.databaseName);

      if (data.objectCounts.length === 0 && data.schemaCounts.length === 0) {
        return {
          success: true,
          message:
            "No user objects were found in the selected database. The database may be empty or the connected login may lack permission to view sys.objects.",
          data,
        };
      }

      return {
        success: true,
        message: formatSchemaSummaryText(data),
        data,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to summarize schema: ${error}`,
      };
    }
  }
}
