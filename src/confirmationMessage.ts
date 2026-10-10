// Builds the elicitation message for write/DDL confirmations so the user sees
// what they are approving before they accept: target database and table,
// filters, and a bounded preview of inserted or updated values.

const MAX_VALUE_LENGTH = 40;
const MAX_LIST_ITEMS = 5;

function formatValue(value: unknown): string {
  const text = typeof value === "string" ? `'${value}'` : JSON.stringify(value);
  const rendered = text ?? String(value);
  return rendered.length > MAX_VALUE_LENGTH
    ? `${rendered.slice(0, MAX_VALUE_LENGTH - 1)}…`
    : rendered;
}

function formatList(items: string[]): string {
  const shown = items.slice(0, MAX_LIST_ITEMS).join(", ");
  const hidden = items.length - MAX_LIST_ITEMS;
  return hidden > 0 ? `${shown} (+${hidden} more)` : shown;
}

function formatFilter(filter: unknown): string {
  if (typeof filter !== "object" || filter === null) {
    return "?";
  }
  const { column, operator, value, values } = filter as Record<string, unknown>;
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return `${String(column)} ${operator}`;
  }
  if (operator === "IN" && Array.isArray(values)) {
    return `${String(column)} IN (${formatList(values.map(formatValue))})`;
  }
  return `${String(column)} ${String(operator)} ${formatValue(value)}`;
}

function formatTarget(
  args: Record<string, unknown>,
  defaultDatabase: string | null
): string {
  const parts = [
    typeof args.databaseName === "string" && args.databaseName.trim()
      ? args.databaseName.trim()
      : defaultDatabase,
    typeof args.schemaName === "string" && args.schemaName.trim()
      ? args.schemaName.trim()
      : undefined,
    String(args.tableName ?? "?"),
  ];
  return parts.filter(Boolean).join(".");
}

function formatWhere(filters: unknown): string {
  return Array.isArray(filters) && filters.length > 0
    ? ` where ${filters.map(formatFilter).join(" AND ")}`
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatAssignments(record: Record<string, unknown>): string {
  return formatList(
    Object.entries(record).map(
      ([column, value]) => `${column} = ${formatValue(value)}`
    )
  );
}

function formatInsertValues(data: unknown): string {
  const rows = Array.isArray(data) ? data : [data];
  const first = rows.find(isRecord);
  if (!first) {
    return "";
  }
  const assignments = formatAssignments(first);
  if (!assignments) {
    return "";
  }
  return rows.length > 1 ? `. First row: ${assignments}` : `: ${assignments}`;
}

export function describeConfirmation(
  toolName: string,
  args: Record<string, unknown>,
  defaultDatabase: string | null
): string {
  const target = formatTarget(args, defaultDatabase);
  let detail: string;

  switch (toolName) {
    case "insert_data": {
      const rows = Array.isArray(args.data) ? args.data.length : 1;
      detail = `insert ${rows} row${rows === 1 ? "" : "s"} into ${target}${formatInsertValues(args.data)}`;
      break;
    }
    case "update_data": {
      const assignments = isRecord(args.updates)
        ? formatAssignments(args.updates)
        : "";
      detail = `update ${target}: set ${assignments}${formatWhere(args.filters)}`;
      break;
    }
    case "delete_data":
      detail = `delete from ${target}${formatWhere(args.filters)}`;
      break;
    case "create_table": {
      const columns = Array.isArray(args.columns) ? args.columns.length : 0;
      detail = `create table ${target} with ${columns} column${columns === 1 ? "" : "s"}`;
      break;
    }
    case "create_index": {
      const columns = Array.isArray(args.columns)
        ? args.columns.map(String)
        : [];
      detail = `create index ${String(args.indexName ?? "?")} on ${target} (${formatList(columns)})`;
      break;
    }
    case "drop_table":
      detail = `drop table ${target}`;
      break;
    default:
      detail = `run ${toolName} on ${target}`;
  }

  return `Confirm ${toolName}: ${detail}. Review the preview and impact before accepting.`;
}
