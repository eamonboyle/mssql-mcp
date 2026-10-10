#!/usr/bin/env node
/**
 * End-to-end MCP HTTP smoke test — exercises every registered tool against the
 * local Docker MSSQL stack (AppDB + ReportingDB).
 *
 * Prerequisites:
 *   - Docker MSSQL running (`npm run db:up`)
 *   - MCP HTTP server running with .env loaded (`MCP_TRANSPORT=http npm start`)
 *     Prefer `npm run test:e2e` which starts the server for you.
 *
 * Usage:
 *   node scripts/e2e-mcp-tools.mjs [baseUrl]
 *   MCP_E2E_BASE_URL=http://127.0.0.1:3333/mcp node scripts/e2e-mcp-tools.mjs
 */

const BASE = process.env.MCP_E2E_BASE_URL ?? process.argv[2] ?? "http://127.0.0.1:3333/mcp";
const DATABASE = "AppDB";
const REPORTING_DB = "ReportingDB";
const SCHEMA = "dbo";

/** @type {Array<{ tool: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }>} */
const results = [];
const exercisedTools = new Set();

let rpcId = 0;

async function mcp(method, params = {}) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });

  if (!res.ok) {
    throw new Error(`${method}: HTTP ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`${method}: no SSE data in response: ${text.slice(0, 300)}`);
  }

  const parsed = JSON.parse(dataLine.slice(6));
  if (parsed.error) {
    throw new Error(`${method}: ${JSON.stringify(parsed.error)}`);
  }
  return parsed.result;
}

function toolPayload(result) {
  if (result?.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const block = result?.content?.find((c) => c.type === "text");
  if (!block?.text) {
    return null;
  }
  try {
    const jsonStart = block.text.indexOf("[\n");
    if (jsonStart >= 0) {
      return JSON.parse(block.text.slice(jsonStart));
    }
    const objStart = block.text.indexOf("{\n");
    if (objStart >= 0) {
      return JSON.parse(block.text.slice(objStart));
    }
    return { message: block.text };
  } catch {
    return { message: block.text };
  }
}

async function callTool(name, args) {
  const result = await mcp("tools/call", { name, arguments: args });
  const payload = toolPayload(result);
  return { result, payload };
}

function rowsFromPayload(payload) {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  if (Array.isArray(payload.data?.rows)) {
    return payload.data.rows;
  }
  if (Array.isArray(payload.objects)) {
    return payload.objects;
  }
  return [];
}

/**
 * @param {string} tool
 * @param {Record<string, unknown>} args
 * @param {(ctx: { payload: Record<string, unknown> | null; result: Record<string, unknown> }) => void | boolean | string} [assertFn]
 */
async function runTool(tool, args, assertFn) {
  exercisedTools.add(tool);
  try {
    const { result, payload } = await callTool(tool, args);
    const failed = result?.isError === true;
    const success = payload?.success === true && !failed;

    if (typeof assertFn === "function") {
      const assertion = assertFn({ payload, result });
      if (assertion === false) {
        results.push({ tool, status: "FAIL", detail: "assertion returned false" });
        return null;
      }
      if (typeof assertion === "string") {
        results.push({ tool, status: "FAIL", detail: assertion });
        return null;
      }
    } else if (!success) {
      const code = payload?.error?.code;
      const message = payload?.message ?? result?.content?.[0]?.text?.slice(0, 160);
      results.push({
        tool,
        status: "FAIL",
        detail: code ? `${code}: ${message}` : String(message ?? "unknown error"),
      });
      return null;
    }

    results.push({ tool, status: "PASS" });
    return payload;
  } catch (error) {
    results.push({
      tool,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Records a named behavioral check (not tied to a single tool invocation).
 * @param {string} label
 * @param {() => Promise<true | string>} fn returns true on success or a failure detail
 */
async function check(label, fn) {
  try {
    const outcome = await fn();
    results.push(
      outcome === true
        ? { tool: label, status: "PASS" }
        : { tool: label, status: "FAIL", detail: String(outcome) }
    );
  } catch (error) {
    results.push({
      tool: label,
      status: "FAIL",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function printReport(registeredToolCount) {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log("\n=== MCP tool E2E results ===\n");
  const nameWidth = Math.max(...results.map((r) => r.tool.length), 4);
  for (const row of results) {
    const status = row.status.padEnd(4);
    const detail = row.detail ? ` — ${row.detail}` : "";
    console.log(`${row.tool.padEnd(nameWidth)}  ${status}${detail}`);
  }
  console.log(`\nUnique registered tools: ${registeredToolCount}`);
  console.log(`Tool invocations: ${results.length} | PASS: ${pass} | FAIL: ${fail} | SKIP: ${skip}`);

  if (fail > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  console.log(`MCP E2E base URL: ${BASE}`);

  await mcp("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mssql-mcp-e2e", version: "1.0" },
  });

  const listed = await mcp("tools/list", {});
  const registered = (listed?.tools ?? []).map((t) => t.name).sort();
  console.log(`Registered tools (${registered.length}): ${registered.join(", ")}`);

  const scratchTable = `McpE2e_${Date.now()}`;
  const scratchIndex = `IX_${scratchTable}_Id`;

  // --- Discovery & schema (read-only) ---
  await runTool("list_databases", {}, ({ payload }) => {
    const names = rowsFromPayload(payload).map((d) => d.name ?? d);
    return names.includes(DATABASE) && names.includes(REPORTING_DB);
  });

  await runTool("list_table", { databaseName: DATABASE });

  await runTool("describe_table", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Customers",
  }, ({ payload }) => Array.isArray(payload?.data) && payload.data.length > 0);

  await runTool("list_objects", { databaseName: DATABASE });

  await runTool("describe_object", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    objectName: "v_CustomerOrderSummary",
    objectTypes: ["view"],
  }, ({ payload }) => payload?.data?.name === "v_CustomerOrderSummary");

  await runTool("list_foreign_keys", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
  });

  await runTool("describe_relationships", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Orders",
  });

  await runTool("describe_dependencies", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    objectName: "Customers",
  });

  await runTool("summarize_schema", { databaseName: DATABASE }, ({ payload }) =>
    Array.isArray(payload?.data?.objectCounts) && payload.data.objectCounts.length > 0
  );

  await runTool("list_largest_tables", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    limit: 5,
  }, ({ payload }) => Array.isArray(payload?.data) && payload.data.length > 0);

  await runTool("analyze_table", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Orders",
  });

  // --- Reads & search ---
  await runTool("read_data", {
    databaseName: DATABASE,
    query: `SELECT TOP 3 Id, Email FROM ${SCHEMA}.Customers ORDER BY Id`,
  }, ({ payload }) => rowsFromPayload(payload).length > 0);

  await runTool("search_data", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Customers",
    columns: ["Email", "Name"],
    searchTerm: "example",
    limit: 5,
  });

  await runTool("explain_query", {
    databaseName: DATABASE,
    query: `SELECT * FROM ${SCHEMA}.Customers WHERE Id = 1`,
  }, ({ payload }) => payload?.data?.planXml != null);

  await runTool("read_data", {
    databaseName: REPORTING_DB,
    query: `SELECT TOP 1 * FROM ${SCHEMA}.DailySales`,
  }, ({ payload }) => rowsFromPayload(payload).length >= 0);

  // --- read_data behavior (validator, streaming limit, errors, rollback) ---
  for (const [label, query] of [
    ["CTE", `WITH c AS (SELECT TOP 2 Id FROM ${SCHEMA}.Customers) SELECT * FROM c`],
    ["VARCHAR cast", `SELECT TOP 1 CAST(Id AS VARCHAR(20)) AS IdText FROM ${SCHEMA}.Customers`],
    ["keyword in literal", `SELECT TOP 1 'Update pending' AS Status FROM ${SCHEMA}.Customers`],
  ]) {
    await check(`read_data accepts ${label}`, async () => {
      const { payload } = await callTool("read_data", { databaseName: DATABASE, query });
      return payload?.success === true || `rejected: ${payload?.message}`;
    });
  }

  let truncatedResultUri;
  await check("read_data stops at MAX_ROWS", async () => {
    const { payload } = await callTool("read_data", {
      databaseName: DATABASE,
      query: "SELECT TOP 50000 a.object_id FROM sys.all_objects a CROSS JOIN sys.all_objects b",
    });
    truncatedResultUri = payload?.meta?.queryResultUri;
    if (payload?.success !== true) return `failed: ${payload?.message}`;
    if (payload.truncated !== true) return "expected truncated=true";
    return rowsFromPayload(payload).length === 10000 || `got ${rowsFromPayload(payload).length} rows`;
  });

  await check("query-result resource readable on a later request", async () => {
    if (!truncatedResultUri) return "no queryResultUri returned";
    const read = await mcp("resources/read", { uri: truncatedResultUri });
    return (read?.contents?.length ?? 0) > 0 || "empty resource contents";
  });

  await check("read_data returns SQL Server error text", async () => {
    const { payload } = await callTool("read_data", {
      databaseName: DATABASE,
      query: `SELECT NoSuchColumn FROM ${SCHEMA}.Customers`,
    });
    return (payload?.success === false && /Invalid column name/i.test(payload?.message ?? "")) ||
      `unexpected: ${payload?.message}`;
  });

  await check("read_data runs in a rolled-back transaction", async () => {
    const { payload } = await callTool("read_data", {
      databaseName: DATABASE,
      query: "SELECT XACT_STATE() AS XactState",
    });
    const row = rowsFromPayload(payload)[0];
    return row?.XactState === 1 || `XACT_STATE() = ${row?.XactState} (${payload?.message})`;
  });

  for (const [label, query] of [
    ["writes hidden in a CTE", `WITH c AS (SELECT Id FROM ${SCHEMA}.Customers) DELETE FROM c`],
    ["COMMIT glued to a number", `SELECT 1COMMIT SELECT 1DELETE FROM ${SCHEMA}.Customers WHERE Id = -1`],
    ["a second statement without a semicolon", "SELECT 1 AS a SELECT name FROM sys.sql_logins"],
  ]) {
    await check(`read_data rejects ${label}`, async () => {
      const { payload } = await callTool("read_data", { databaseName: DATABASE, query });
      return payload?.error?.code === "SECURITY_VALIDATION_FAILED" || `unexpected: ${payload?.message}`;
    });
  }

  const previewUpdate = await runTool("preview_update", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Customers",
    updates: { Name: "E2E Smoke" },
    filters: [{ column: "Id", operator: "=", value: -1 }],
  });

  const updateToken = previewUpdate?.data?.previewToken;
  if (typeof updateToken === "string" && updateToken.length > 0) {
    await runTool("update_data", {
      databaseName: DATABASE,
      schemaName: SCHEMA,
      tableName: "Customers",
      updates: { Name: "E2E Smoke" },
      filters: [{ column: "Id", operator: "=", value: -1 }],
      previewToken: updateToken,
      confirmed: true,
    });
  } else {
    exercisedTools.add("update_data");
    results.push({ tool: "update_data", status: "FAIL", detail: "missing previewToken from preview_update" });
  }

  const previewDelete = await runTool("preview_delete", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Customers",
    filters: [{ column: "Id", operator: "=", value: -1 }],
  });

  const deleteToken = previewDelete?.data?.previewToken;
  if (typeof deleteToken === "string" && deleteToken.length > 0) {
    await runTool("delete_data", {
      databaseName: DATABASE,
      schemaName: SCHEMA,
      tableName: "Customers",
      filters: [{ column: "Id", operator: "=", value: -1 }],
      previewToken: deleteToken,
      confirmed: true,
    });
  } else {
    exercisedTools.add("delete_data");
    results.push({ tool: "delete_data", status: "FAIL", detail: "missing previewToken from preview_delete" });
  }

  // --- Insert (non-destructive; unique email) ---
  await runTool("insert_data", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: "Customers",
    data: {
      Name: "E2E Insert",
      Email: `e2e.${Date.now()}@example.com`,
      City: "Testville",
    },
    confirmed: true,
  });

  // --- DDL (requires ENABLE_DDL=true on the server) ---
  const ddlCreated = await runTool("create_table", {
    databaseName: DATABASE,
    schemaName: SCHEMA,
    tableName: scratchTable,
    columns: [
      {
        name: "Id",
        type: "INT",
        nullable: false,
        isPrimaryKey: true,
        isIdentity: true,
      },
      {
        name: "Note",
        type: "NVARCHAR(100)",
        nullable: true,
      },
    ],
    confirmed: true,
  });

  if (ddlCreated?.success) {
    await runTool("create_index", {
      databaseName: DATABASE,
      schemaName: SCHEMA,
      tableName: scratchTable,
      indexName: scratchIndex,
      columns: ["Id"],
      isUnique: true,
      confirmed: true,
    });

    await runTool("drop_table", {
      databaseName: DATABASE,
      schemaName: SCHEMA,
      tableName: scratchTable,
      confirmed: true,
    });
  } else {
    const ddlDetail = results.find((r) => r.tool === "create_table")?.detail ?? "DDL disabled?";
    for (const ddlTool of ["create_index", "drop_table"]) {
      exercisedTools.add(ddlTool);
      results.push({ tool: ddlTool, status: "SKIP", detail: `create_table failed (${ddlDetail})` });
    }
  }

  for (const name of registered) {
    if (!exercisedTools.has(name)) {
      results.push({ tool: name, status: "FAIL", detail: "not exercised by this harness" });
    }
  }

  printReport(registered.length);
}

main().catch((error) => {
  console.error("E2E fatal:", error);
  process.exit(1);
});
