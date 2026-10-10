#!/usr/bin/env node
/**
 * Protocol-level E2E: drives the built server with the official MCP client in
 * both protocol eras against the local Docker MSSQL stack.
 *
 *   - 2026-07-28 (modern) over Streamable HTTP: multi-round-trip elicitation
 *   - 2025-11-25 (legacy, how Cursor connects today) over stdio: classic
 *     elicitation via the SDK's legacy shim, and the confirmed=true fallback
 *     for clients without elicitation
 *   - request cancellation reaching SQL Server
 *
 * Prerequisites: `npm run build` and `npm run db:up`. Usage:
 *   node scripts/e2e-protocol.mjs
 */
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const HTTP_PORT = Number(process.env.MCP_E2E_PROTOCOL_PORT ?? 3334);
const HTTP_URL = new URL(`http://127.0.0.1:${HTTP_PORT}/mcp`);
const SERVER_ENTRY = fileURLToPath(new URL("../dist/index.js", import.meta.url));

/** @type {Array<{ name: string; status: 'PASS' | 'FAIL'; detail?: string }>} */
const results = [];

async function check(name, fn) {
  try {
    const outcome = await fn();
    results.push(outcome === true ? { name, status: "PASS" } : { name, status: "FAIL", detail: String(outcome) });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}

function payloadOf(result) {
  return result?.structuredContent ?? null;
}

/**
 * @param {{ elicitation?: 'accept' | 'decline' | false, mode?: 'legacy' | 'auto' | { pin: string } }} options
 */
function createClient({ elicitation = false, mode = "legacy" } = {}) {
  const client = new Client(
    { name: "mssql-mcp-protocol-e2e", version: "1.0.0" },
    {
      capabilities: elicitation ? { elicitation: { form: {} } } : {},
      versionNegotiation: { mode },
    }
  );
  const prompts = [];
  if (elicitation) {
    client.setRequestHandler("elicitation/create", async (request) => {
      prompts.push(request.params.message);
      return elicitation === "accept"
        ? { action: "accept", content: { confirmed: true } }
        : { action: "decline" };
    });
  }
  return { client, prompts };
}

function insertArgs(label) {
  return {
    databaseName: "AppDB",
    schemaName: "dbo",
    tableName: "Customers",
    data: { Name: `Protocol E2E ${label}`, Email: `protocol.${label}.${Date.now()}@example.com`, City: "Testville" },
  };
}

function stdioTransport() {
  return new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY], stderr: "ignore" });
}

async function startHttpServer() {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, MCP_TRANSPORT: "http", MCP_HTTP_PORT: String(HTTP_PORT) },
    stdio: ["ignore", "ignore", "inherit"],
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(HTTP_URL, { method: "GET" });
      return child;
    } catch {
      await delay(200);
    }
  }
  child.kill();
  throw new Error(`HTTP server did not start on ${HTTP_URL}`);
}

async function modernHttpChecks() {
  const { client, prompts } = createClient({ elicitation: "accept", mode: { pin: "2026-07-28" } });
  await client.connect(new StreamableHTTPClientTransport(HTTP_URL));

  await check("modern/http: negotiates 2026-07-28 (server/discover)", async () =>
    client.getDiscoverResult() !== undefined || "no discover result"
  );

  await check("modern/http: read_data", async () => {
    const result = await client.callTool({
      name: "read_data",
      arguments: { databaseName: "AppDB", query: "SELECT TOP 2 Id FROM dbo.Customers" },
    });
    return payloadOf(result)?.success === true || JSON.stringify(result).slice(0, 200);
  });

  await check("modern/http: insert_data confirmed through input_required", async () => {
    const result = await client.callTool({ name: "insert_data", arguments: insertArgs("modern") });
    if (prompts.length !== 1) return `expected 1 elicitation, saw ${prompts.length}`;
    return payloadOf(result)?.success === true || payloadOf(result)?.message;
  });

  const declining = createClient({ elicitation: "decline", mode: { pin: "2026-07-28" } });
  await declining.client.connect(new StreamableHTTPClientTransport(HTTP_URL));
  await check("modern/http: declined confirmation blocks the write", async () => {
    const result = await declining.client.callTool({ name: "insert_data", arguments: insertArgs("declined") });
    return payloadOf(result)?.error?.code === "CONFIRMATION_REQUIRED" || payloadOf(result)?.message;
  });

  await check("modern/http: cancellation stops the SQL query", async () => {
    const marker = `cancel_${Date.now()}`;
    const controller = new AbortController();
    const call = client
      .callTool(
        {
          name: "read_data",
          arguments: {
            databaseName: "AppDB",
            query: `SELECT MAX(CHECKSUM(a.name, b.name, c.name)) AS ${marker} FROM sys.all_objects a CROSS JOIN sys.all_objects b CROSS JOIN sys.all_objects c`,
          },
        },
        { signal: controller.signal }
      )
      .catch((error) => error);
    await delay(1500);
    const runningBefore = await countRunning(client, marker);
    controller.abort();
    await call;
    await delay(1500);
    const runningAfter = await countRunning(client, marker);
    if (runningBefore < 1) return `query was not observed running (${runningBefore})`;
    return runningAfter === 0 || `query still running after cancel (${runningAfter})`;
  });

  await client.close();
  await declining.client.close();

  // Stateless HTTP cannot carry a 2025-era server-to-client elicitation
  // round trip, so legacy HTTP clients must use confirmed=true.
  const legacyHttp = createClient({ elicitation: "accept" });
  await legacyHttp.client.connect(new StreamableHTTPClientTransport(HTTP_URL));
  await check("legacy/http: write requires confirmed=true (no elicitation)", async () => {
    const result = await legacyHttp.client.callTool({ name: "insert_data", arguments: insertArgs("legacyhttp") });
    const payload = payloadOf(result);
    if (legacyHttp.prompts.length !== 0) return `unexpected elicitation (${legacyHttp.prompts.length})`;
    return payload?.error?.code === "CONFIRMATION_REQUIRED" || payload?.message;
  });
  await legacyHttp.client.close();
}

async function countRunning(client, marker) {
  const result = await client.callTool({
    name: "read_data",
    arguments: {
      databaseName: "AppDB",
      // The marker is split so this monitoring query does not match itself.
      query: `SELECT COUNT(*) AS Running FROM sys.dm_exec_requests r CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) t WHERE t.text LIKE '%' + 'AS ${marker.slice(0, 7)}' + '${marker.slice(7)} %'`,
    },
  });
  const payload = payloadOf(result);
  if (payload?.success !== true) throw new Error(`monitor query failed: ${payload?.message}`);
  return payload.data[0].Running;
}

async function legacyStdioChecks() {
  const accepting = createClient({ elicitation: "accept" });
  await accepting.client.connect(stdioTransport());
  await check("legacy/stdio: insert_data confirmed through elicitation (Cursor path)", async () => {
    const result = await accepting.client.callTool({ name: "insert_data", arguments: insertArgs("legacy") });
    if (accepting.prompts.length !== 1) return `expected 1 elicitation, saw ${accepting.prompts.length}`;
    return payloadOf(result)?.success === true || payloadOf(result)?.message;
  });
  await accepting.client.close();

  const noElicitation = createClient({ elicitation: false });
  await noElicitation.client.connect(stdioTransport());
  await check("legacy/stdio: no elicitation capability falls back to confirmed=true", async () => {
    const result = await noElicitation.client.callTool({ name: "insert_data", arguments: insertArgs("fallback") });
    const payload = payloadOf(result);
    return (payload?.error?.code === "CONFIRMATION_REQUIRED" && /unavailable/i.test(payload.message)) || payload?.message;
  });
  await check("legacy/stdio: confirmed=true still writes", async () => {
    const result = await noElicitation.client.callTool({
      name: "insert_data",
      arguments: { ...insertArgs("explicit"), confirmed: true },
    });
    return payloadOf(result)?.success === true || payloadOf(result)?.message;
  });
  await noElicitation.client.close();

  const auto = createClient({ elicitation: "accept", mode: "auto" });
  await auto.client.connect(stdioTransport());
  await check("auto/stdio: negotiates the modern era over stdio", async () =>
    auto.client.getDiscoverResult() !== undefined || "fell back to legacy"
  );
  await auto.client.close();
}

async function main() {
  const httpServer = await startHttpServer();
  try {
    await modernHttpChecks();
    await legacyStdioChecks();
  } finally {
    httpServer.kill("SIGTERM");
  }

  console.log("\n=== MCP protocol E2E results ===\n");
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    console.log(`${r.name.padEnd(width)}  ${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  console.log(`\nChecks: ${results.length} | PASS: ${results.length - failed} | FAIL: ${failed}`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error("Protocol E2E fatal:", error);
  process.exit(1);
});
