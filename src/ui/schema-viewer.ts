import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";

interface DescribeTableResult {
  success: boolean;
  columns?: { name: string; type: string }[];
  message?: string;
}

let lastDatabase: string | undefined;
let selectedTable: string | undefined;

const app = new App(
  { name: "MSSQL Schema Viewer", version: "1.0.0" },
  { tools: { listChanged: true } }
);

const statusEl = document.getElementById("status")!;
const contentEl = document.getElementById("content")!;
const viewDataBtn = document.getElementById("view-data-btn")!;

app.ontoolinput = (params) => {
  const args = params.arguments as { tableName?: string; databaseName?: string };
  if (args?.tableName) selectedTable = args.tableName;
  if (args?.databaseName !== undefined) lastDatabase = args.databaseName;
};

app.ontoolresult = (result) => {
  const textContent = result.content?.find((c) => c.type === "text")?.text;
  if (!textContent) {
    renderError("No data received");
    return;
  }
  try {
    const parsed: DescribeTableResult = JSON.parse(textContent);
    renderSchema(parsed);
  } catch {
    renderError("Failed to parse result");
  }
};

function renderSchema(result: DescribeTableResult) {
  if (!result.success) {
    renderError(result.message ?? "Failed to describe table");
    return;
  }
  const columns = result.columns ?? [];
  statusEl.textContent = `${selectedTable ?? "Table"}: ${columns.length} column(s)`;
  statusEl.className = "status";

  if (columns.length === 0) {
    contentEl.innerHTML = '<div class="empty">No columns found</div>';
    viewDataBtn.style.display = "none";
    return;
  }

  viewDataBtn.style.display = selectedTable ? "inline-block" : "none";

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>Column</th><th>Type</th></tr>";
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  columns.forEach((col) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(col.name)}</td><td>${escapeHtml(col.type)}</td>`;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  contentEl.innerHTML = "";
  contentEl.appendChild(table);
}

function renderError(message: string) {
  statusEl.textContent = message;
  statusEl.className = "status error";
  contentEl.innerHTML = `<div class="empty error">${escapeHtml(message)}</div>`;
  viewDataBtn.style.display = "none";
}

function escapeHtml(s: string) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
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
