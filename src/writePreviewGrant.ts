import { createHash } from "node:crypto";
import type { SqlFilter } from "./writeSafety.js";

export type WriteDataToolName = "update_data" | "delete_data";

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v instanceof Date) {
      return v.toISOString();
    }
    return v;
  });
}

function normalizeFilters(filters: SqlFilter[]): unknown[] {
  return [...filters]
    .map((f) => ({
      column: f.column,
      operator: f.operator,
      value: f.value,
      values: f.values ? [...f.values] : undefined,
    }))
    .sort((a, b) => {
      const byCol = a.column.localeCompare(b.column);
      if (byCol !== 0) {
        return byCol;
      }
      return a.operator.localeCompare(b.operator);
    });
}

function normalizeUpdates(updates: Record<string, unknown>): Record<string, unknown> {
  const keys = Object.keys(updates).sort((a, b) => a.localeCompare(b));
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = updates[key];
  }
  return out;
}

export function fingerprintForUpdateOp(params: {
  databaseName?: string;
  schemaName?: string;
  tableName: string;
  filters: SqlFilter[];
  updates: Record<string, unknown>;
}): string {
  const payload = {
    kind: "update" as const,
    database: params.databaseName ?? "",
    schema: params.schemaName ?? "",
    table: params.tableName,
    filters: normalizeFilters(params.filters),
    updates: normalizeUpdates(params.updates),
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function fingerprintForDeleteOp(params: {
  databaseName?: string;
  schemaName?: string;
  tableName: string;
  filters: SqlFilter[];
}): string {
  const payload = {
    kind: "delete" as const,
    database: params.databaseName ?? "",
    schema: params.schemaName ?? "",
    table: params.tableName,
    filters: normalizeFilters(params.filters),
  };
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export type PreviewOrWriteName =
  | "preview_update"
  | "preview_delete"
  | "update_data"
  | "delete_data";

export function fingerprintForWriteTool(
  toolName: PreviewOrWriteName,
  requestArgs: Record<string, unknown>
): string {
  const filters = (requestArgs.filters as SqlFilter[]) ?? [];
  const databaseName =
    typeof requestArgs.databaseName === "string" ? requestArgs.databaseName : undefined;
  const schemaName =
    typeof requestArgs.schemaName === "string" ? requestArgs.schemaName : undefined;
  const tableName = String(requestArgs.tableName ?? "");
  if (toolName === "preview_delete" || toolName === "delete_data") {
    return fingerprintForDeleteOp({ databaseName, schemaName, tableName, filters });
  }
  return fingerprintForUpdateOp({
    databaseName,
    schemaName,
    tableName,
    filters,
    updates: (requestArgs.updates as Record<string, unknown>) ?? {},
  });
}
