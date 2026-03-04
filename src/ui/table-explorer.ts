import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";

interface ListTableResult {
  success: boolean;
  message?: string;
  items?: { [key: string]: string }[];
  error?: string;
}

interface DescribeTableResult {
  success: boolean;
  columns?: { name: string; type: string }[];
  message?: string;
}

let lastDatabase: string | undefined;
let selectedTable: string | undefined;

const app = new App(
  { name: "MSSQL Table Explorer", version: "1.0.0" },
  { tools: { listChanged: true } }
);

const statusEl = document.getElementById("status")!;
const tableListEl = document.getElementById("table-list")!;
const schemaViewerEl = document.getElementById("schema-viewer")!;
const schemaTitleEl = document.getElementById("schema-title")!;
const schemaTableEl = document.getElementById("schema-table")!;
const viewDataBtn = document.getElementById("view-data-btn")!;

app.ontoolinput = (params) => {
  const args = params.arguments as { databaseName?: string };
  if (args?.databaseName !== undefined) lastDatabase = args.databaseName;
};

app.ontoolresult = (result) => {
  const textContent = result.content?.find((c) => c.type === "text")?.text;
  if (!textContent) {
    renderError("No data received");
    return;
  }
  try {
    const parsed = JSON.parse(textContent);
    if (parsed.items !== undefined) {
      renderTableList(parsed as ListTableResult);
    } else if (parsed.columns !== undefined) {
      renderSchema(parsed as DescribeTableResult);
    } else {
      renderError(parsed.message ?? "Unknown result");
    }
  } catch {
    renderError("Failed to parse result");
  }
};

function getTableNames(items: { [key: string]: string }[]): string[] {
  if (!items?.length) return [];
  const first = items[0];
  const key = Object.keys(first)[0] ?? "tableName";
  return items.map((row) => row[key] ?? row.tableName ?? row[""] ?? String(Object.values(row)[0])).filter(Boolean);
}

function renderTableList(result: ListTableResult) {
  if (!result.success) {
    renderError(result.message ?? result.error ?? "Failed to list tables");
    return;
  }
  const tables = getTableNames(result.items ?? []);
  statusEl.textContent = `${tables.length} table(s)`;
  statusEl.className = "status";

  tableListEl.innerHTML = "";
  schemaViewerEl.style.display = "none";

  tables.forEach((tableName) => {
    const li = document.createElement("li");
    li.className = "table-item";
    const span = document.createElement("span");
    span.className = "table-name";
    span.textContent = tableName;
    const describeBtn = document.createElement("button");
    describeBtn.className = "btn";
    describeBtn.textContent = "Describe";
    describeBtn.onclick = () => describeTable(tableName);
    li.appendChild(span);
    li.appendChild(describeBtn);
    tableListEl.appendChild(li);
  });
}

function renderSchema(result: DescribeTableResult) {
  if (!result.success) {
    renderError(result.message ?? "Failed to describe table");
    return;
  }
  schemaViewerEl.style.display = "block";
  schemaTitleEl.textContent = `Schema: ${selectedTable ?? "?"}`;

  const columns = result.columns ?? [];
  schemaTableEl.innerHTML = "";
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Column</th><th>Type</th></tr>";
  schemaTableEl.appendChild(thead);
  const tbody = document.createElement("tbody");
  columns.forEach((col) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(col.name)}</td><td>${escapeHtml(col.type)}</td>`;
    tbody.appendChild(tr);
  });
  schemaTableEl.appendChild(tbody);

  viewDataBtn.style.display = selectedTable ? "inline-block" : "none";
}

function renderError(message: string) {
  statusEl.textContent = message;
  statusEl.className = "status error";
  tableListEl.innerHTML = "";
  schemaViewerEl.style.display = "none";
}

function escapeHtml(s: string) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

async function describeTable(tableName: string) {
  selectedTable = tableName;
  try {
    const result = await app.callServerTool({
      name: "describe_table",
      arguments: { tableName, ...(lastDatabase && { databaseName: lastDatabase }) },
    });
    const textContent = result.content?.find((c) => c.type === "text")?.text;
    if (textContent) {
      const parsed: DescribeTableResult = JSON.parse(textContent);
      renderSchema(parsed);
    }
  } catch (e) {
    renderError(e instanceof Error ? e.message : "Describe failed");
  }
}

viewDataBtn.addEventListener("click", async () => {
  if (!selectedTable) return;
  viewDataBtn.disabled = true;
  try {
    await app.callServerTool({
      name: "read_data",
      arguments: {
        query: `SELECT TOP 100 * FROM ${selectedTable}`,
        ...(lastDatabase && { databaseName: lastDatabase }),
      },
    });
  } catch {
    // Result appears in chat
  } finally {
    viewDataBtn.disabled = false;
  }
});

app.connect();
