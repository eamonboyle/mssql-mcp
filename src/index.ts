#!/usr/bin/env node

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

dotenv.config();

import {
  getMaxRows,
  getMcpHttpHost,
  getMcpHttpPort,
  getMcpTransport,
  getMaxWriteRows,
  getQueryTimeoutMs,
  isDdlEnabled,
  isWritePreviewRequired,
} from "./config.js";
import { getAllowedDatabases } from "./db.js";
import {
  createResourceLink,
  createToolResult,
  normalizeToolResult,
  type StandardToolPayload,
} from "./mcpResults.js";
import { registerPrompts } from "./promptRegistry.js";
import { registerResources } from "./resourceRegistry.js";
import { ServerState } from "./serverState.js";
import { getAvailableTools } from "./toolRegistry.js";
import { fingerprintForWriteTool } from "./writePreviewGrant.js";
import { writePreviewGrantStore } from "./writePreviewGrantStore.js";
import { previewFilteredRows } from "./writePreview.js";

const SERVER_VERSION = "1.3.1";
const SERVER_NAME = "mssql-mcp-server";

function createInstructions(isReadOnly: boolean) {
  const baseInstructions =
    "Inspect schema first with list_objects, list_table, describe_object, or describe_table. Prefer read_data, search_data, analyze_table, describe_relationships, and explain_query for safe analysis. For update_data and delete_data, run preview_update or preview_delete first, then pass the returned previewToken with confirmed=true when REQUIRE_WRITE_PREVIEW is enabled (default).";
  const readOnlyInstructions =
    " This server is READONLY: write and DDL tools are disabled. Never use sqlcmd, SSMS, other DB CLI tools, or terminal scripts to bypass the MCP safety model.";

  return isReadOnly ? baseInstructions + readOnlyInstructions : baseInstructions;
}

function createServerInstance(state: ServerState) {
  const isReadOnly = process.env.READONLY === "true";
  const allowedDatabases = getAllowedDatabases();
  const availableTools = getAvailableTools(isReadOnly);
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      websiteUrl: "https://github.com/eamonboyle/mssql-mcp",
      icons: [
        {
          src: "https://raw.githubusercontent.com/eamonboyle/mssql-mcp/main/src/img/logo.png",
          mimeType: "image/png",
        },
      ],
    },
    {
      instructions: createInstructions(isReadOnly),
      capabilities: {
        logging: {},
      },
    }
  );

  for (const definition of availableTools) {
    server.registerTool(
      definition.tool.name,
      {
        title: definition.tool.name
          .split("_")
          .map((part) => part[0].toUpperCase() + part.slice(1))
          .join(" "),
        description: definition.tool.description,
        inputSchema: definition.inputSchema,
        outputSchema: definition.outputSchema,
        annotations: definition.annotations,
      },
      async (args, extra) => {
        if (
          definition.requiresDdl &&
          !isDdlEnabled()
        ) {
          return createToolResult({
            version: 1,
            success: false,
            message:
              "DDL tools are disabled. Set ENABLE_DDL=true to allow create_table, create_index, and drop_table.",
            error: {
              code: "DDL_DISABLED",
            },
          });
        }

        const requestArgs =
          typeof args === "object" && args !== null
            ? ({ ...args } as Record<string, unknown>)
            : {};

        if (definition.requiresConfirmation && requestArgs.confirmed !== true) {
          try {
            const elicited = await server.server.elicitInput({
              mode: "form",
              message: `Confirm ${definition.tool.name} after reviewing its preview and impact.`,
              requestedSchema: {
                type: "object",
                properties: {
                  confirmed: {
                    type: "boolean",
                    title: "Confirmed",
                    description:
                      "I reviewed the preview and want to proceed with this operation.",
                  },
                },
                required: ["confirmed"],
              },
            });

            if (elicited.action !== "accept" || !elicited.content?.confirmed) {
              if (definition.writePreviewTool && isWritePreviewRequired()) {
                return createToolResult({
                  version: 1,
                  success: false,
                  message: `Confirmation canceled. Call ${definition.writePreviewTool}, then run ${definition.tool.name} with the returned previewToken and confirmed=true.`,
                  error: { code: "PREVIEW_REQUIRED" },
                });
              }
              if (definition.writePreviewTool) {
                return createToolResult({
                  version: 1,
                  success: false,
                  message: `Confirmation canceled. Retry with confirmed=true after reviewing ${definition.writePreviewTool}.`,
                  error: { code: "CONFIRMATION_REQUIRED" },
                });
              }
              return createToolResult({
                version: 1,
                success: false,
                message:
                  "Confirmation canceled. Retry with confirmed=true after reviewing the operation.",
                error: { code: "CONFIRMATION_REQUIRED" },
              });
            }

            requestArgs.confirmed = true;
          } catch {
            if (definition.writePreviewTool && isWritePreviewRequired()) {
              return createToolResult({
                version: 1,
                success: false,
                message: `Interactive confirmation is unavailable. Call ${definition.writePreviewTool}, then run ${definition.tool.name} with previewToken and confirmed=true.`,
                error: { code: "PREVIEW_REQUIRED" },
              });
            }
            if (definition.writePreviewTool) {
              return createToolResult({
                version: 1,
                success: false,
                message: `Interactive confirmation is unavailable. Retry with confirmed=true after reviewing ${definition.writePreviewTool}.`,
                error: { code: "CONFIRMATION_REQUIRED" },
              });
            }
            return createToolResult({
              version: 1,
              success: false,
              message:
                "Interactive confirmation is unavailable. Retry with confirmed=true after reviewing the operation.",
              error: { code: "CONFIRMATION_REQUIRED" },
            });
          }
        }

        if (definition.tool.name === "update_data" || definition.tool.name === "delete_data") {
          const preview = await previewFilteredRows({
            tableName: String(requestArgs.tableName),
            schemaName:
              typeof requestArgs.schemaName === "string"
                ? requestArgs.schemaName
                : undefined,
            filters: (requestArgs.filters as Parameters<typeof previewFilteredRows>[0]["filters"]) ?? [],
            databaseName:
              typeof requestArgs.databaseName === "string"
                ? requestArgs.databaseName
                : undefined,
            limit: 1,
          }).catch((error) => ({
            affectedRowCount: -1,
            rows: [],
            query: "",
            countQuery: "",
            previewError: String(error),
          }));

          if ("previewError" in preview) {
            return createToolResult({
              version: 1,
              success: false,
              message: `Failed to validate write impact: ${preview.previewError}`,
              error: {
                code: "WRITE_PREVIEW_FAILED",
              },
            });
          }

          if (preview.affectedRowCount > getMaxWriteRows()) {
            return createToolResult({
              version: 1,
              success: false,
              message: `Write exceeds MAX_WRITE_ROWS (${getMaxWriteRows()}). Matching rows: ${preview.affectedRowCount}. Narrow the filters or raise MAX_WRITE_ROWS.`,
              error: {
                code: "WRITE_LIMIT_EXCEEDED",
              },
              data: {
                affectedRowCount: preview.affectedRowCount,
              },
            });
          }

          if (isWritePreviewRequired()) {
            const writeName = definition.tool.name as "update_data" | "delete_data";
            const fingerprint = fingerprintForWriteTool(writeName, requestArgs);
            const previewToken =
              typeof requestArgs.previewToken === "string" ? requestArgs.previewToken.trim() : "";
            if (!writePreviewGrantStore.consume(previewToken, fingerprint, writeName)) {
              return createToolResult({
                version: 1,
                success: false,
                message: `Invalid or expired write preview token. Call ${
                  writeName === "update_data" ? "preview_update" : "preview_delete"
                } with the same table, filters${
                  writeName === "update_data" ? ", and updates" : ""
                }, then pass the returned previewToken with confirmed=true.`,
                error: { code: "PREVIEW_TOKEN_INVALID" },
              });
            }
          }
        }

        if (definition.tool.name === "insert_data") {
          const rows = Array.isArray(requestArgs.data) ? requestArgs.data.length : 1;
          if (rows > getMaxWriteRows()) {
            return createToolResult({
              version: 1,
              success: false,
              message: `Insert exceeds MAX_WRITE_ROWS (${getMaxWriteRows()}). Requested rows: ${rows}.`,
              error: {
                code: "WRITE_LIMIT_EXCEEDED",
              },
              data: {
                requestedRows: rows,
              },
            });
          }
        }

        if (
          definition.tool.name === "explain_query" &&
          extra._meta?.progressToken !== undefined
        ) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: extra._meta.progressToken,
              progress: 1,
              total: 2,
              message: "Generating estimated execution plan",
            },
          });
        }

        const rawResult = await definition.tool.run(requestArgs);
        if (
          (definition.tool.name === "preview_update" ||
            definition.tool.name === "preview_delete") &&
          isWritePreviewRequired() &&
          typeof rawResult === "object" &&
          rawResult !== null &&
          (rawResult as { success?: boolean }).success === true
        ) {
          const fingerprint = fingerprintForWriteTool(
            definition.tool.name,
            requestArgs
          );
          const writeTool =
            definition.tool.name === "preview_update" ? "update_data" : "delete_data";
          const previewToken = writePreviewGrantStore.issue(fingerprint, writeTool);
          const withData = rawResult as { data?: unknown };
          if (typeof withData.data === "object" && withData.data !== null && !Array.isArray(withData.data)) {
            withData.data = { ...(withData.data as object), previewToken };
          } else {
            withData.data = { preview: withData.data, previewToken };
          }
        }
        const payload = normalizeToolResult(
          rawResult,
          `${definition.tool.name} completed.`
        );
        const extraContent = [];

        if (definition.tool.name === "explain_query" && typeof rawResult === "object" && rawResult) {
          const planXml =
            typeof (rawResult as Record<string, unknown>).planXml === "string"
              ? ((rawResult as Record<string, unknown>).planXml as string)
              : undefined;
          const databaseName =
            typeof requestArgs.databaseName === "string"
              ? requestArgs.databaseName
              : undefined;

          if (planXml) {
            const plan = state.storeQueryPlan(
              databaseName,
              String(requestArgs.query ?? ""),
              planXml
            );
            extraContent.push(
              createResourceLink(
                `mssql://query-plan/${plan.id}`,
                "query-plan",
                "Execution Plan",
                "Stored estimated execution plan for this query.",
                "application/json"
              )
            );
            payload.meta = {
              ...(payload.meta ?? {}),
              queryPlanUri: `mssql://query-plan/${plan.id}`,
            };
            await server.server.sendResourceListChanged();
            await server.server.sendResourceUpdated({
              uri: `mssql://query-plan/${plan.id}`,
            });
          }
        }

        if (
          (definition.tool.name === "read_data" || definition.tool.name === "search_data") &&
          payload.success
        ) {
          const data = payload.data;
          const recordCount = Array.isArray(data)
            ? data.length
            : Array.isArray((data as { data?: unknown[] } | undefined)?.data)
              ? (data as { data: unknown[] }).data.length
              : 0;
          if (recordCount >= 25 || payload.truncated) {
            const result = state.storeQueryResult(
              typeof requestArgs.databaseName === "string"
                ? requestArgs.databaseName
                : undefined,
              definition.tool.name,
              data
            );
            extraContent.push(
              createResourceLink(
                `mssql://query-result/${result.id}`,
                "query-result",
                "Query Result",
                "Stored query result for larger result-grid rendering.",
                "application/json"
              )
            );
            payload.meta = {
              ...(payload.meta ?? {}),
              queryResultUri: `mssql://query-result/${result.id}`,
            };
            await server.server.sendResourceListChanged();
            await server.server.sendResourceUpdated({
              uri: `mssql://query-result/${result.id}`,
            });
          }
        }

        if (
          definition.tool.name === "explain_query" &&
          extra._meta?.progressToken !== undefined
        ) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken: extra._meta.progressToken,
              progress: 2,
              total: 2,
              message: "Execution plan ready",
            },
          });
        }

        return createToolResult(payload as StandardToolPayload, extraContent);
      }
    );
  }

  registerResources(server, {
    serverName: SERVER_NAME,
    serverVersion: SERVER_VERSION,
    isReadOnly,
    allowedDatabases,
    toolNames: availableTools.map((tool) => tool.tool.name),
    maxRows: getMaxRows(),
    queryTimeoutMs: getQueryTimeoutMs(),
    state,
  });
  registerPrompts(server, { isReadOnly });

  return server;
}

async function readRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return undefined;
  }

  return JSON.parse(raw);
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse) {
  const server = createServerInstance(new ServerState());
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    const parsedBody =
      req.method === "POST" ? await readRequestBody(req) : undefined;
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    console.error("HTTP transport error:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        })
      );
    }
  } finally {
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function runStdioServer() {
  const server = createServerInstance(new ServerState());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function runHttpServer() {
  const host = getMcpHttpHost();
  const port = getMcpHttpPort();

  const httpServer = createServer((req, res) => {
    void handleHttpRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });

  console.error(`MCP Streamable HTTP server listening on http://${host}:${port}`);
}

async function main() {
  if (getMcpTransport() === "http") {
    await runHttpServer();
    return;
  }

  await runStdioServer();
}

main().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
