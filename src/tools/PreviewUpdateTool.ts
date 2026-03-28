import { clampRowLimit } from "../config.js";
import { previewFilteredRows } from "../writePreview.js";
import type { SqlFilter } from "../writeSafety.js";

interface PreviewUpdateParams {
  tableName: string;
  schemaName?: string;
  filters: SqlFilter[];
  updates: Record<string, unknown>;
  previewLimit?: number;
  databaseName?: string;
}

export class PreviewUpdateTool {
  name = "preview_update";
  description =
    "Previews which rows would be updated before running update_data.";

  async run(params: PreviewUpdateParams) {
    try {
      const preview = await previewFilteredRows({
        tableName: params.tableName,
        schemaName: params.schemaName,
        filters: params.filters,
        databaseName: params.databaseName,
        limit: clampRowLimit(params.previewLimit, 25),
      });

      return {
        success: true,
        message: `Previewed ${preview.rows.length} row(s) for update; ${preview.affectedRowCount} row(s) would be affected.`,
        data: {
          ...preview,
          updates: params.updates,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to preview update: ${error}`,
      };
    }
  }
}
