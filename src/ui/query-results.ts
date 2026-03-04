import { App } from "@modelcontextprotocol/ext-apps/app-with-deps";

const QUERY_RESULTS_URI = "ui://mssql/query-results.html";

interface QueryResult {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>[];
  recordCount?: number;
  totalRecords?: number;
  error?: string;
}

let lastQuery = "";
let lastDatabase: string | undefined;

const app = new App(
  { name: "MSSQL Query Results", version: "1.0.0" },
  { tools: { listChanged: true } }
);

const statusEl = document.getElementById("status")!;
const contentEl = document.getElementById("content")!;
const filterInput = document.getElementById("filter") as HTMLInputElement;
const refreshBtn = document.getElementById("refresh-btn")!;

app.ontoolinput = (params) => {
  const args = params.arguments as { query?: string; databaseName?: string };
  if (args?.query) lastQuery = args.query;
  if (args?.databaseName !== undefined) lastDatabase = args.databaseName;
};

app.ontoolresult = (result) => {
  const textContent = result.content?.find((c) => c.type === "text")?.text;
  if (!textContent) {
    renderError("No data received");
    return;
  }
  try {
    const parsed: QueryResult = JSON.parse(textContent);
    renderResult(parsed);
  } catch {
    renderError("Failed to parse result");
  }
};

function renderResult(result: QueryResult) {
  if (!result.success) {
    renderError(result.message ?? result.error ?? "Query failed");
    return;
  }
  const data = result.data ?? [];
  const recordCount = result.recordCount ?? data.length;
  const totalRecords = result.totalRecords ?? recordCount;
  const truncated = totalRecords > recordCount;

  statusEl.textContent = `${recordCount} row${recordCount !== 1 ? "s" : ""}${truncated ? ` (showing first ${recordCount} of ${totalRecords})` : ""}`;
  statusEl.className = "status";

  if (data.length === 0) {
    contentEl.innerHTML = '<div class="empty">No rows returned</div>';
    filterInput.style.display = "none";
    refreshBtn.disabled = !lastQuery;
    return;
  }

  filterInput.style.display = "inline-block";
  refreshBtn.disabled = false;

  const columns = Object.keys(data[0]);
  let filteredData = [...data];
  let sortCol: string | null = null;
  let sortDir: "asc" | "desc" = "asc";

  function renderTable(rows: Record<string, unknown>[]) {
    contentEl.innerHTML = "";
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tr = document.createElement("tr");
    columns.forEach((col) => {
      const th = document.createElement("th");
      th.textContent = col;
      th.dataset.col = col;
      th.addEventListener("click", () => {
        if (sortCol === col) sortDir = sortDir === "asc" ? "desc" : "asc";
        else (sortCol = col), (sortDir = "asc");
        const sorted = [...rows].sort((a, b) => {
          const aVal = a[col];
          const bVal = b[col];
          const cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, { numeric: true });
          return sortDir === "asc" ? cmp : -cmp;
        });
        renderTable(sorted);
      });
      tr.appendChild(th);
    });
    thead.appendChild(tr);
    table.appendChild(thead);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      columns.forEach((col) => {
        const td = document.createElement("td");
        const val = row[col];
        td.textContent = val === null || val === undefined ? "" : String(val);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    contentEl.appendChild(table);
  }

  filterInput.oninput = () => {
    const q = filterInput.value.toLowerCase();
    filteredData = q
      ? data.filter((row) =>
          columns.some((col) => String(row[col] ?? "").toLowerCase().includes(q))
        )
      : [...data];
    renderTable(filteredData);
  };

  renderTable(filteredData);
}

function renderError(message: string) {
  statusEl.textContent = message;
  statusEl.className = "status error";
  contentEl.innerHTML = `<div class="empty error">${escapeHtml(message)}</div>`;
  filterInput.style.display = "none";
  refreshBtn.disabled = !lastQuery;
}

function escapeHtml(s: string) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

refreshBtn.addEventListener("click", async () => {
  if (!lastQuery) return;
  refreshBtn.disabled = true;
  statusEl.textContent = "Refreshing...";
  try {
    const result = await app.callServerTool({
      name: "read_data",
      arguments: { query: lastQuery, ...(lastDatabase && { databaseName: lastDatabase }) },
    });
    const textContent = result.content?.find((c) => c.type === "text")?.text;
    if (textContent) {
      const parsed: QueryResult = JSON.parse(textContent);
      renderResult(parsed);
    } else {
      renderError("Refresh failed");
    }
  } catch (e) {
    renderError(e instanceof Error ? e.message : "Refresh failed");
  } finally {
    refreshBtn.disabled = false;
  }
});

app.connect();
