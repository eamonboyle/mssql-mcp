import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
} from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/server";

/**
 * MCP Apps (io.modelcontextprotocol/ui) view that renders read_data and
 * search_data results as an interactive grid in hosts that support it
 * (Claude, VS Code, Cursor, …). Hosts without MCP Apps ignore the tool
 * metadata and keep using the text/structured result.
 */
export const QUERY_RESULTS_APP_URI = "ui://mssql/query-results.html";

const require = createRequire(import.meta.url);

/**
 * Loads the self-contained ext-apps View runtime and rewrites its trailing
 * `export{…}` into a local binding so it can be inlined into a single
 * module script (hosts render the view from one HTML document).
 */
function loadAppRuntime(): string {
  const bundle = readFileSync(
    require.resolve("@modelcontextprotocol/ext-apps/app-with-deps"),
    "utf8"
  );
  const exportStart = bundle.lastIndexOf("export{");
  if (exportStart === -1) {
    throw new Error("Unexpected ext-apps bundle format: missing export list.");
  }
  const exportEnd = bundle.indexOf("}", exportStart);
  const entries = bundle
    .slice(exportStart + "export{".length, exportEnd)
    .split(",")
    .map((entry) => {
      const [local, exported = local] = entry.trim().split(/\s+as\s+/);
      return `${JSON.stringify(exported)}:${local}`;
    });
  return `${bundle.slice(0, exportStart)}const ExtApps={${entries.join(",")}};${bundle.slice(exportEnd + 1)}`;
}

const VIEW_STYLES = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: var(--font-text-sm-size, 13px);
  color: var(--color-text-primary, CanvasText);
  background: var(--color-background-primary, Canvas);
}
header {
  display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  padding: 8px 10px;
  border-bottom: 1px solid var(--color-border-primary, #8884);
}
header .summary { flex: 1; color: var(--color-text-secondary, GrayText); }
.badge {
  padding: 1px 6px; border-radius: 999px; font-size: 11px;
  background: var(--color-background-warning, #f5a62333);
  color: var(--color-text-warning, inherit);
}
input[type="search"] {
  font: inherit; padding: 3px 8px; min-width: 160px;
  color: inherit; background: transparent;
  border: 1px solid var(--color-border-primary, #8886);
  border-radius: var(--border-radius-sm, 4px);
}
.grid { overflow: auto; max-height: 480px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td {
  padding: 4px 10px; text-align: left; white-space: nowrap;
  border-bottom: 1px solid var(--color-border-secondary, #8882);
  max-width: 360px; overflow: hidden; text-overflow: ellipsis;
}
th {
  position: sticky; top: 0; cursor: pointer; user-select: none;
  background: var(--color-background-secondary, Canvas);
  font-weight: 600;
}
th[aria-sort="ascending"]::after { content: " ▲"; }
th[aria-sort="descending"]::after { content: " ▼"; }
td.null { color: var(--color-text-tertiary, GrayText); font-style: italic; }
td.num { text-align: right; }
.empty, .error { padding: 16px 10px; color: var(--color-text-secondary, GrayText); }
.error { color: var(--color-text-danger, #d33); }
`;

const VIEW_SCRIPT = `
const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = ExtApps;
const MAX_RENDERED_ROWS = 1000;
const root = document.getElementById("root");
let rows = [];
let columns = [];
let meta = {};
let sort = { column: null, direction: 1 };
let filter = "";

function extractRows(payload) {
  const data = payload && payload.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

function formatCell(value) {
  if (value === null || value === undefined) return { text: "NULL", cls: "null" };
  if (typeof value === "number" || typeof value === "bigint") return { text: String(value), cls: "num" };
  if (typeof value === "object") return { text: JSON.stringify(value), cls: "" };
  return { text: String(value), cls: "" };
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children || []) node.append(child);
  return node;
}

function visibleRows() {
  let result = rows;
  if (filter) {
    const needle = filter.toLowerCase();
    result = result.filter((row) =>
      columns.some((column) => String(row[column] ?? "").toLowerCase().includes(needle))
    );
  }
  if (sort.column !== null) {
    const column = sort.column;
    result = [...result].sort((a, b) => {
      const left = a[column];
      const right = b[column];
      if (left === right) return 0;
      if (left === null || left === undefined) return 1;
      if (right === null || right === undefined) return -1;
      return (left < right ? -1 : 1) * sort.direction;
    });
  }
  return result;
}

function render() {
  root.replaceChildren();
  if (meta.error) {
    root.append(el("div", { class: "error", text: meta.error }));
    return;
  }

  const shown = visibleRows();
  const rendered = shown.slice(0, MAX_RENDERED_ROWS);
  const summaryParts = [rows.length + " row" + (rows.length === 1 ? "" : "s")];
  if (filter) summaryParts.push(shown.length + " matching");
  if (rendered.length < shown.length) summaryParts.push("showing first " + rendered.length);

  const header = el("header", {}, [
    el("span", { class: "summary", text: summaryParts.join(" · ") }),
  ]);
  if (meta.truncated) {
    header.append(el("span", { class: "badge", text: "Truncated at MAX_ROWS", title: "More rows exist on the server" }));
  }
  header.append(
    el("input", {
      type: "search",
      placeholder: "Filter rows",
      value: filter,
      "aria-label": "Filter rows",
      oninput: (event) => {
        filter = event.target.value;
        render();
        const input = root.querySelector("input[type=search]");
        input.focus();
        input.setSelectionRange(filter.length, filter.length);
      },
    })
  );
  root.append(header);

  if (rows.length === 0) {
    root.append(el("div", { class: "empty", text: meta.message || "No rows returned." }));
    return;
  }

  const headRow = el("tr", {}, columns.map((column) => {
    const ariaSort = sort.column === column ? (sort.direction === 1 ? "ascending" : "descending") : "none";
    return el("th", {
      text: column,
      scope: "col",
      "aria-sort": ariaSort,
      onclick: () => {
        sort = sort.column === column ? { column, direction: -sort.direction } : { column, direction: 1 };
        render();
      },
    });
  }));
  const body = el("tbody", {}, rendered.map((row) =>
    el("tr", {}, columns.map((column) => {
      const cell = formatCell(row[column]);
      return el("td", { class: cell.cls, text: cell.text, title: cell.text });
    }))
  ));
  root.append(el("div", { class: "grid" }, [el("table", {}, [el("thead", {}, [headRow]), body])]));
}

function showResult(result) {
  const payload = result && result.structuredContent;
  if (!payload) {
    meta = { error: "This result has no structured content to display." };
  } else if (payload.success === false) {
    meta = { error: payload.message || "The query failed." };
  } else {
    rows = extractRows(payload);
    columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    meta = { truncated: payload.truncated === true, message: payload.message };
  }
  sort = { column: null, direction: 1 };
  filter = "";
  render();
}

function applyHostContext(context) {
  if (!context) return;
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles && context.styles.variables) applyHostStyleVariables(context.styles.variables);
  if (context.styles && context.styles.css && context.styles.css.fonts) applyHostFonts(context.styles.css.fonts);
}

const app = new App({ name: "mssql-query-results", version: "1.0.0" }, {}, { autoResize: true });
app.ontoolresult = showResult;
app.onhostcontextchanged = applyHostContext;
root.append(el("div", { class: "empty", text: "Waiting for query results…" }));
await app.connect();
applyHostContext(app.getHostContext());
`;

let cachedHtml: string | undefined;

export function buildQueryResultsHtml(): string {
  cachedHtml ??= `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Query results</title>
<style>${VIEW_STYLES}</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${loadAppRuntime()}
${VIEW_SCRIPT}
</script>
</body>
</html>
`;
  return cachedHtml;
}

export function registerQueryResultsApp(server: McpServer): void {
  registerAppResource(
    server,
    "query_results_app",
    QUERY_RESULTS_APP_URI,
    {
      title: "Query Results Grid",
      description:
        "Interactive, sortable and filterable grid for read_data and search_data results.",
      mimeType: RESOURCE_MIME_TYPE,
      _meta: { ui: { prefersBorder: true } },
    },
    async () => ({
      contents: [
        {
          uri: QUERY_RESULTS_APP_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: buildQueryResultsHtml(),
          _meta: { ui: { prefersBorder: true } },
        },
      ],
    })
  );
}

/** Tool `_meta` linking a tool to the query-results view (both key styles). */
export const queryResultsToolMeta = {
  ui: { resourceUri: QUERY_RESULTS_APP_URI },
  "ui/resourceUri": QUERY_RESULTS_APP_URI,
};
