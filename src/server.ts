import {
  McpServer,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  queryResultsToolMeta,
  registerQueryResultsApp,
} from "./apps/queryResultsApp.js";
import { type EnvironmentConfig, getMcpEndpointUrl } from "./config.js";
import { getAllowedDatabases, runWithSqlRequestContext } from "./db.js";
import {
  createResourceLink,
  createToolResult,
  normalizeToolResult,
  type StandardToolPayload,
} from "./mcpResults.js";
import { SERVER_NAME, SERVER_VERSION } from "./packageInfo.js";
import { registerPrompts } from "./promptRegistry.js";
import { registerResources } from "./resourceRegistry.js";
import type { ServerState } from "./serverState.js";
import { getAvailableTools, type ToolDefinition } from "./toolRegistry.js";
import { fingerprintForWriteTool } from "./writePreviewGrant.js";
import { writePreviewGrantStore } from "./writePreviewGrantStore.js";
import { previewFilteredRows } from "./writePreview.js";

const CONFIRMATION_INPUT_KEY = "confirm";

/** Tools whose results render in the MCP Apps query-results grid. */
const QUERY_RESULT_APP_TOOLS = new Set(["read_data", "search_data"]);

const CONFIRMATION_SCHEMA = {
  type: "object" as const,
  properties: {
    confirmed: {
      type: "boolean" as const,
      title: "Confirmed",
      description:
        "I reviewed the preview and want to proceed with this operation.",
    },
  },
  required: ["confirmed"],
};

type ToolHandlerResult = CallToolResult | InputRequiredResult;

function clientSupportsFormElicitation(server: McpServer): boolean {
  // On 2026-07-28 requests the SDK backfills this per request from the
  // envelope; on 2025-era connections it is the initialize-time value.
  const elicitation = server.server.getClientCapabilities()?.elicitation;
  // An empty `elicitation: {}` declaration implies form support.
  return (
    elicitation !== undefined &&
    (elicitation.form !== undefined || elicitation.url === undefined)
  );
}

function confirmationRequiredResult(
  definition: ToolDefinition,
  environment: EnvironmentConfig,
  reason: "canceled" | "unavailable"
): CallToolResult {
  const prefix =
    reason === "canceled"
      ? "Confirmation canceled."
      : "Interactive confirmation is unavailable.";
  const toolName = definition.tool.name;
  const previewTool = definition.writePreviewTool;

  if (previewTool && environment.requireWritePreview) {
    return createToolResult({
      version: 1,
      success: false,
      message: `${prefix} Call ${previewTool}, then run ${toolName} with the returned previewToken and confirmed=true.`,
      error: { code: "PREVIEW_REQUIRED" },
    });
  }

  return createToolResult({
    version: 1,
    success: false,
    message: previewTool
      ? `${prefix} Retry with confirmed=true after reviewing ${previewTool}.`
      : `${prefix} Retry with confirmed=true after reviewing the operation.`,
    error: { code: "CONFIRMATION_REQUIRED" },
  });
}

async function notifyProgress(
  ctx: ServerContext,
  progress: number,
  total: number,
  message: string
) {
  const progressToken = ctx.mcpReq._meta?.progressToken;
  if (progressToken === undefined) {
    return;
  }
  await ctx.mcpReq.notify({
    method: "notifications/progress",
    params: { progressToken, progress, total, message },
  });
}

function createInstructions(isReadOnly: boolean) {
  const baseInstructions =
    "Inspect schema first with summarize_schema, list_objects, list_table, describe_object, or describe_table. Use list_largest_tables for capacity discovery. Prefer read_data for data analysis. Use search_data, analyze_table, describe_relationships, describe_dependencies, and explain_query for safe analysis. For update_data and delete_data, run preview_update or preview_delete first, then pass the returned previewToken with confirmed=true when REQUIRE_WRITE_PREVIEW is enabled (default).";
  const readOnlyInstructions =
    " This server is READONLY: write and DDL tools are disabled. Never use sqlcmd, SSMS, other DB CLI tools, or terminal scripts to bypass the MCP safety model.";

  return isReadOnly
    ? baseInstructions + readOnlyInstructions
    : baseInstructions;
}

export function createServerInstance(
  state: ServerState,
  environment: EnvironmentConfig
) {
  const readOnly = environment.readOnly;
  const allowedDatabases = getAllowedDatabases();
  const availableTools = getAvailableTools(readOnly);
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
      instructions: createInstructions(readOnly),
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
        outputSchema: z.object(definition.outputSchema),
        annotations: definition.annotations,
        ...(QUERY_RESULT_APP_TOOLS.has(definition.tool.name)
          ? { _meta: queryResultsToolMeta }
          : {}),
      },
      async (args, ctx): Promise<ToolHandlerResult> => {
        if (definition.requiresDdl && !environment.enableDdl) {
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
          const confirmation = inputResponse(
            ctx.mcpReq.inputResponses,
            CONFIRMATION_INPUT_KEY
          );

          if (confirmation.kind === "missing") {
            if (!clientSupportsFormElicitation(server)) {
              return confirmationRequiredResult(
                definition,
                environment,
                "unavailable"
              );
            }
            // Multi-round-trip confirmation: 2026-07-28 clients answer the
            // embedded request and retry; for 2025-era clients the SDK sends a
            // classic elicitation request and re-enters this handler.
            return inputRequired({
              inputRequests: {
                [CONFIRMATION_INPUT_KEY]: inputRequired.elicit({
                  message: `Confirm ${definition.tool.name} after reviewing its preview and impact.`,
                  requestedSchema: CONFIRMATION_SCHEMA,
                }),
              },
            });
          }

          if (
            confirmation.kind !== "elicit" ||
            confirmation.action !== "accept" ||
            confirmation.content?.confirmed !== true
          ) {
            return confirmationRequiredResult(
              definition,
              environment,
              "canceled"
            );
          }

          requestArgs.confirmed = true;
        }

        if (
          definition.tool.name === "update_data" ||
          definition.tool.name === "delete_data"
        ) {
          const preview = await previewFilteredRows({
            tableName: String(requestArgs.tableName),
            schemaName:
              typeof requestArgs.schemaName === "string"
                ? requestArgs.schemaName
                : undefined,
            filters:
              (requestArgs.filters as Parameters<
                typeof previewFilteredRows
              >[0]["filters"]) ?? [],
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

          if (preview.affectedRowCount > environment.maxWriteRows) {
            return createToolResult({
              version: 1,
              success: false,
              message: `Write exceeds MAX_WRITE_ROWS (${environment.maxWriteRows}). Matching rows: ${preview.affectedRowCount}. Narrow the filters or raise MAX_WRITE_ROWS.`,
              error: {
                code: "WRITE_LIMIT_EXCEEDED",
              },
              data: {
                affectedRowCount: preview.affectedRowCount,
              },
            });
          }

          if (environment.requireWritePreview) {
            const writeName = definition.tool.name as
              "update_data" | "delete_data";
            const fingerprint = fingerprintForWriteTool(writeName, requestArgs);
            const previewToken =
              typeof requestArgs.previewToken === "string"
                ? requestArgs.previewToken.trim()
                : "";
            if (
              !writePreviewGrantStore.consume(
                previewToken,
                fingerprint,
                writeName
              )
            ) {
              return createToolResult({
                version: 1,
                success: false,
                message: `Invalid or expired write preview token. Call ${
                  writeName === "update_data"
                    ? "preview_update"
                    : "preview_delete"
                } with the same table, filters${
                  writeName === "update_data" ? ", and updates" : ""
                }, then pass the returned previewToken with confirmed=true.`,
                error: { code: "PREVIEW_TOKEN_INVALID" },
              });
            }
          }
        }

        if (definition.tool.name === "insert_data") {
          const rows = Array.isArray(requestArgs.data)
            ? requestArgs.data.length
            : 1;
          if (rows > environment.maxWriteRows) {
            return createToolResult({
              version: 1,
              success: false,
              message: `Insert exceeds MAX_WRITE_ROWS (${environment.maxWriteRows}). Requested rows: ${rows}.`,
              error: {
                code: "WRITE_LIMIT_EXCEEDED",
              },
              data: {
                requestedRows: rows,
              },
            });
          }
        }

        if (definition.tool.name === "explain_query") {
          await notifyProgress(
            ctx,
            1,
            2,
            "Generating estimated execution plan"
          );
        }

        const rawResult = await runWithSqlRequestContext(
          { signal: ctx.mcpReq.signal },
          () => definition.tool.run(requestArgs)
        );
        if (
          (definition.tool.name === "preview_update" ||
            definition.tool.name === "preview_delete") &&
          environment.requireWritePreview &&
          typeof rawResult === "object" &&
          rawResult !== null &&
          (rawResult as { success?: boolean }).success === true
        ) {
          const fingerprint = fingerprintForWriteTool(
            definition.tool.name,
            requestArgs
          );
          const writeTool =
            definition.tool.name === "preview_update"
              ? "update_data"
              : "delete_data";
          const previewToken = writePreviewGrantStore.issue(
            fingerprint,
            writeTool
          );
          const withData = rawResult as { data?: unknown };
          if (
            typeof withData.data === "object" &&
            withData.data !== null &&
            !Array.isArray(withData.data)
          ) {
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

        if (
          definition.tool.name === "explain_query" &&
          typeof rawResult === "object" &&
          rawResult
        ) {
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
            server.sendResourceListChanged();
          }
        }

        if (
          (definition.tool.name === "read_data" ||
            definition.tool.name === "search_data") &&
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
            server.sendResourceListChanged();
          }
        }

        if (definition.tool.name === "explain_query") {
          await notifyProgress(ctx, 2, 2, "Execution plan ready");
        }

        return createToolResult(payload as StandardToolPayload, extraContent);
      }
    );
  }

  registerResources(server, {
    serverName: SERVER_NAME,
    serverVersion: SERVER_VERSION,
    isReadOnly: readOnly,
    allowedDatabases,
    toolNames: availableTools.map((tool) => tool.tool.name),
    maxRows: environment.maxRows,
    queryTimeoutMs: environment.queryTimeoutMs,
    transport: environment.mcpTransport,
    publicEndpoint:
      environment.mcpTransport === "http"
        ? getMcpEndpointUrl(environment)
        : undefined,
    sqlAuthType: environment.auth.type,
    encrypt: environment.encrypt,
    trustServerCertificate: environment.trustServerCertificate,
    enableDdl: environment.enableDdl,
    requireWritePreview: environment.requireWritePreview,
    state,
  });
  registerPrompts(server, { isReadOnly: readOnly });
  registerQueryResultsApp(server);

  return server;
}
