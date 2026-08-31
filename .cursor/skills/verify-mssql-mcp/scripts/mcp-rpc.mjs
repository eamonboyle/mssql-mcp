#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const DEFAULT_BASE_URL = "http://127.0.0.1:3334/mcp";
const STATE_BASE_URL_FILE = `${process.env.VERIFY_STATE_DIR ?? "/tmp/verify-mssql-mcp/state"}/base_url`;

function readStateBaseUrl() {
  if (!existsSync(STATE_BASE_URL_FILE)) {
    return undefined;
  }
  const value = readFileSync(STATE_BASE_URL_FILE, "utf8").trim();
  return value.length > 0 ? value : undefined;
}

function parseCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "base-url": { type: "string" },
      out: { type: "string" },
      contains: { type: "string", multiple: true },
      "require-success": { type: "boolean", default: true },
    },
  });

  return {
    baseUrl:
      values["base-url"] ??
      process.env.MCP_VERIFY_BASE_URL ??
      process.env.MCP_E2E_BASE_URL ??
      readStateBaseUrl() ??
      DEFAULT_BASE_URL,
    outPath: values.out,
    contains: values.contains ?? [],
    requireSuccess: values["require-success"] !== false,
    positionals,
  };
}

function usage() {
  return `Usage:
  node mcp-rpc.mjs [--base-url URL] [--out file] [--contains text] [--no-require-success] <method> [args]

Methods:
  initialize
  tools/list
  tools/call <toolName> [jsonArgs]
  resources/list
  resources/read <uri>
  prompts/list
  prompts/get <promptName> [jsonArgs]

Default base URL is VERIFY_STATE_DIR/base_url, else http://127.0.0.1:3334/mcp.`;
}

async function mcp(baseUrl, method, params, id) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method}: HTTP ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
  }

  const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`${method}: no SSE data in response: ${text.slice(0, 400)}`);
  }

  const parsed = JSON.parse(dataLine.slice(6));
  if (parsed.error) {
    throw new Error(`${method}: ${JSON.stringify(parsed.error)}`);
  }
  return parsed;
}

function parseJsonArg(raw, fallback) {
  if (raw === undefined) {
    return fallback;
  }
  return JSON.parse(raw);
}

function extractPayload(method, result) {
  if (method === "tools/call") {
    if (result?.structuredContent && typeof result.structuredContent === "object") {
      return result.structuredContent;
    }
    const block = result?.content?.find((item) => item.type === "text");
    if (typeof block?.text === "string") {
      return { message: block.text };
    }
    return result ?? null;
  }

  if (method === "resources/read") {
    const text = result?.contents?.[0]?.text;
    if (typeof text === "string") {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
    return result ?? null;
  }

  if (method === "prompts/get") {
    return result ?? null;
  }

  return result ?? null;
}

function buildRpc(method, positionals) {
  switch (method) {
    case "initialize":
      return {
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "verify-mssql-mcp", version: "1.0" },
        },
      };
    case "tools/list":
      return { method: "tools/list", params: {} };
    case "tools/call": {
      const toolName = positionals[1];
      if (!toolName) {
        throw new Error("tools/call requires a tool name");
      }
      return {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: parseJsonArg(positionals[2], {}),
        },
      };
    }
    case "resources/list":
      return { method: "resources/list", params: {} };
    case "resources/read": {
      const uri = positionals[1];
      if (!uri) {
        throw new Error("resources/read requires a uri");
      }
      return { method: "resources/read", params: { uri } };
    }
    case "prompts/list":
      return { method: "prompts/list", params: {} };
    case "prompts/get": {
      const promptName = positionals[1];
      if (!promptName) {
        throw new Error("prompts/get requires a prompt name");
      }
      return {
        method: "prompts/get",
        params: {
          name: promptName,
          arguments: parseJsonArg(positionals[2], {}),
        },
      };
    }
    default:
      throw new Error(`${usage()}\nUnknown method: ${method}`);
  }
}

function payloadLooksFailed(method, rpc, payload) {
  if (method !== "tools/call") {
    return false;
  }
  if (rpc.result?.isError === true) {
    return true;
  }
  if (payload && typeof payload === "object" && payload.success === false) {
    return true;
  }
  return false;
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const method = cli.positionals[0];
  if (!method) {
    console.error(usage());
    process.exit(2);
  }

  const request = buildRpc(method, cli.positionals);
  let nextId = 1;

  if (method !== "initialize") {
    await mcp(cli.baseUrl, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "verify-mssql-mcp", version: "1.0" },
    }, nextId++);
  }

  const rpc = await mcp(cli.baseUrl, request.method, request.params, nextId);
  const payload = extractPayload(method, rpc.result);
  const envelope = {
    baseUrl: cli.baseUrl,
    method: request.method,
    params: request.params,
    payload,
    rpc,
  };

  const json = `${JSON.stringify(envelope, null, 2)}\n`;
  process.stdout.write(json);

  if (cli.outPath) {
    mkdirSync(dirname(cli.outPath), { recursive: true });
    writeFileSync(cli.outPath, json);
  }

  for (const needle of cli.contains) {
    if (!json.includes(needle)) {
      console.error(`missing expected text in payload: ${needle}`);
      process.exit(1);
    }
  }

  if (cli.requireSuccess && payloadLooksFailed(method, rpc, payload)) {
    const code = payload?.error?.code;
    const message = payload?.message ?? "tool call failed";
    console.error(code ? `${code}: ${message}` : message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
