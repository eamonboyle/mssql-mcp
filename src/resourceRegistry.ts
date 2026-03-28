import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  describeObjectDependencies,
  describeDatabaseObject,
  describeTableSchema,
  getDatabaseSchemaSummary,
  listForeignKeys,
  listDatabaseObjects,
  listDatabaseTables,
} from "./schema.js";
import { promptDefinitions } from "./promptRegistry.js";
import { ServerState } from "./serverState.js";

interface ResourceTemplateDefinition {
  name: string;
  uriTemplate: string;
  description: string;
  mimeType: string;
}

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface ResourceRegistryContext {
  serverName: string;
  serverVersion: string;
  isReadOnly: boolean;
  allowedDatabases: string[];
  toolNames: string[];
  maxRows: number;
  queryTimeoutMs: number;
  state: ServerState;
}

const resourceTemplates: ResourceTemplateDefinition[] = [
  {
    name: "table_schema",
    uriTemplate: "mssql://table/{databaseName}/{schemaName}/{tableName}",
    description: "Detailed schema for a single table resource.",
    mimeType: "application/json",
  },
  {
    name: "object_definition",
    uriTemplate: "mssql://object/{databaseName}/{schemaName}/{objectName}",
    description:
      "Definition and metadata for a single table, view, procedure, function, or trigger.",
    mimeType: "application/json",
  },
  {
    name: "object_dependencies",
    uriTemplate:
      "mssql://database/{databaseName}/object/{schemaName}/{objectName}/dependencies",
    description: "Dependencies for a single object.",
    mimeType: "application/json",
  },
];
const RESOURCE_LIST_TTL_MS = 30_000;

function buildUiDocument(title: string, body: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        --bg: #101317;
        --panel: rgba(20, 27, 34, 0.88);
        --text: #f1eee8;
        --muted: #96a3b0;
        --accent: #f5a524;
        --line: rgba(245, 165, 36, 0.18);
        --shadow: 0 30px 80px rgba(0, 0, 0, 0.45);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(245, 165, 36, 0.18), transparent 28%),
          radial-gradient(circle at bottom right, rgba(43, 106, 255, 0.18), transparent 25%),
          linear-gradient(160deg, #0b0f13 0%, #101317 45%, #121920 100%);
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }
      .eyebrow {
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: var(--accent);
        font-size: 12px;
      }
      h1 {
        margin: 10px 0 14px;
        font-size: clamp(34px, 7vw, 72px);
        line-height: 0.96;
        font-weight: 600;
      }
      p {
        max-width: 780px;
        color: var(--muted);
        font-size: 16px;
        line-height: 1.6;
      }
      .panel {
        margin-top: 28px;
        padding: 24px;
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(10px);
      }
      pre {
        overflow: auto;
        padding: 18px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.03);
        color: #d8e3ef;
        font: 13px/1.5 "Cascadia Code", Consolas, monospace;
      }
      .accent-bar {
        width: 120px;
        height: 3px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--accent), transparent);
      }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

function buildResourceText(payload: unknown) {
  return JSON.stringify(payload, null, 2);
}

function parseResourceUri(uri: string) {
  const parsed = new URL(uri);
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (parsed.protocol === "ui:") {
    return {
      resourceType: "ui",
      segments: [parsed.hostname, ...segments],
    };
  }

  return {
    resourceType: parsed.hostname,
    segments,
  };
}

function createListingCache(ttlMs: number) {
  const cache = new Map<string, CacheEntry<unknown>>();

  return async function getCachedValue<T>(
    key: string,
    loader: () => Promise<T>
  ): Promise<T> {
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const value = await loader();
    cache.set(key, {
      value,
      expiresAt: now + ttlMs,
    });
    return value;
  };
}

async function readResourcePayload(
  uri: string,
  context: ResourceRegistryContext,
  getCachedValue: <T>(key: string, loader: () => Promise<T>) => Promise<T>
) {
  const parsed = parseResourceUri(uri);

  if (parsed.resourceType === "config") {
    if (parsed.segments[0] === "server") {
      return {
        server: {
          name: context.serverName,
          version: context.serverVersion,
          readOnly: context.isReadOnly,
          allowedDatabases: context.allowedDatabases,
          maxRows: context.maxRows,
          queryTimeoutMs: context.queryTimeoutMs,
        },
        tools: context.toolNames,
      };
    }

    if (parsed.segments[0] === "prompts") {
      return {
        prompts: promptDefinitions,
      };
    }
  }

  if (parsed.resourceType === "database") {
    const [databaseName, resourceName] = parsed.segments;

    if (resourceName === "tables") {
      return {
        databaseName,
        tables: await getCachedValue(`tables:${databaseName}`, () =>
          listDatabaseTables(databaseName)
        ),
      };
    }

    if (resourceName === "objects") {
      return {
        databaseName,
        objects: await getCachedValue(`objects:${databaseName}`, () =>
          listDatabaseObjects(databaseName)
        ),
      };
    }

    if (resourceName === "schema-summary") {
      return {
        databaseName,
        summary: await getCachedValue(`schema-summary:${databaseName}`, () =>
          getDatabaseSchemaSummary(databaseName)
        ),
      };
    }

    if (resourceName === "foreign-keys") {
      return {
        databaseName,
        foreignKeys: await getCachedValue(`foreign-keys:${databaseName}`, () =>
          listForeignKeys(databaseName)
        ),
      };
    }
  }

  if (parsed.resourceType === "table") {
    const [databaseName, schemaName, tableName] = parsed.segments;
    return {
      databaseName,
      schemaName,
      tableName,
      columns: await describeTableSchema(tableName, databaseName, schemaName),
    };
  }

  if (parsed.resourceType === "object") {
    const [databaseName, schemaName, objectName] = parsed.segments;
    const object = await describeDatabaseObject(
      objectName,
      databaseName,
      schemaName
    );

    if (!object) {
      throw new Error(`No object named '${objectName}' was found.`);
    }

    return object;
  }

  if (parsed.resourceType === "query-plan") {
    const [planId] = parsed.segments;
    const plan = context.state.getQueryPlan(planId);
    if (!plan) {
      throw new Error(`Unknown query plan resource '${planId}'.`);
    }

    return plan;
  }

  if (parsed.resourceType === "query-result") {
    const [resultId] = parsed.segments;
    const result = context.state.getQueryResult(resultId);
    if (!result) {
      throw new Error(`Unknown query result resource '${resultId}'.`);
    }

    return result;
  }

  if (parsed.resourceType === "ui") {
    const [, appName] = parsed.segments;
    if (appName === "query-plan-viewer") {
      return buildUiDocument(
        "Query Plan Viewer",
        `<div class="eyebrow">MSSQL MCP App</div>
         <h1>Execution Plan Atlas</h1>
         <div class="accent-bar"></div>
         <p>This app resource is intended for clients that support MCP Apps. Render the associated tool result and query-plan resource together so the user can inspect operators, costs, and XML details without leaving chat.</p>
         <section class="panel">
           <pre>{
  "expectedInput": "mssql://query-plan/{id}",
  "recommendedTool": "explain_query",
  "fallback": "Read the linked plan resource as JSON or XML."
}</pre>
         </section>`
      );
    }

    if (appName === "schema-explorer") {
      return buildUiDocument(
        "Schema Explorer",
        `<div class="eyebrow">MSSQL MCP App</div>
         <h1>Schema Atlas</h1>
         <div class="accent-bar"></div>
         <p>Use this app with schema, object, relationship, and foreign-key resources. Hosts can pair it with live tool outputs to present a browsable database map.</p>
         <section class="panel"><pre>{
  "resources": [
    "mssql://database/{db}/schema-summary",
    "mssql://database/{db}/foreign-keys",
    "mssql://table/{db}/{schema}/{table}",
    "mssql://object/{db}/{schema}/{object}"
  ]
}</pre></section>`
      );
    }

    if (appName === "result-grid") {
      return buildUiDocument(
        "Result Grid",
        `<div class="eyebrow">MSSQL MCP App</div>
         <h1>Result Grid</h1>
         <div class="accent-bar"></div>
         <p>This app is a client-side grid target for large read and search results. The plain-text fallback remains the linked JSON resource.</p>
         <section class="panel"><pre>{
  "expectedInput": "mssql://query-result/{id}",
  "recommendedTools": ["read_data", "search_data"]
}</pre></section>`
      );
    }

    if (appName === "write-preview") {
      return buildUiDocument(
        "Write Preview",
        `<div class="eyebrow">MSSQL MCP App</div>
         <h1>Write Preview Ledger</h1>
         <div class="accent-bar"></div>
         <p>Use this app with preview tools to inspect affected rows, filters, and risk before the user confirms any write or DDL action.</p>
         <section class="panel"><pre>{
  "recommendedTools": ["preview_update", "preview_delete"],
  "safety": ["confirmed=true", "MAX_WRITE_ROWS", "ENABLE_DDL"]
}</pre></section>`
      );
    }
  }

  if (
    parsed.resourceType === "database" &&
    parsed.segments[1] === "object" &&
    parsed.segments[4] === "dependencies"
  ) {
    const [databaseName, _objectKeyword, schemaName, objectName] = parsed.segments;
    return {
      databaseName,
      schemaName,
      objectName,
      dependencies: await describeObjectDependencies(
        objectName,
        databaseName,
        schemaName
      ),
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

function buildReadHandler(
  context: ResourceRegistryContext,
  getCachedValue: <T>(key: string, loader: () => Promise<T>) => Promise<T>
) {
  return async (uri: URL) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: buildResourceText(
          await readResourcePayload(uri.href, context, getCachedValue)
        ),
      },
    ],
  });
}

export function registerResources(
  server: McpServer,
  context: ResourceRegistryContext
): void {
  const getCachedValue = createListingCache(RESOURCE_LIST_TTL_MS);
  const readHandler = buildReadHandler(context, getCachedValue);

  server.registerResource(
    "server_config",
    "mssql://config/server",
    {
      title: "Server Config",
      description: "Server configuration, limits, and enabled tools.",
      mimeType: "application/json",
    },
    readHandler
  );

  server.registerResource(
    "prompt_catalog",
    "mssql://config/prompts",
    {
      title: "Prompt Catalog",
      description: "Available prompt templates exposed by this server.",
      mimeType: "application/json",
    },
    readHandler
  );

  for (const databaseName of context.allowedDatabases) {
    server.registerResource(
      `${databaseName}_tables`,
      `mssql://database/${encodeURIComponent(databaseName)}/tables`,
      {
        title: `${databaseName} Tables`,
        description: `Base tables available in database ${databaseName}.`,
        mimeType: "application/json",
      },
      readHandler
    );

    server.registerResource(
      `${databaseName}_objects`,
      `mssql://database/${encodeURIComponent(databaseName)}/objects`,
      {
        title: `${databaseName} Objects`,
        description:
          `Tables, views, procedures, functions, and triggers available in database ${databaseName}.`,
        mimeType: "application/json",
      },
      readHandler
    );

    server.registerResource(
      `${databaseName}_schema_summary`,
      `mssql://database/${encodeURIComponent(databaseName)}/schema-summary`,
      {
        title: `${databaseName} Schema Summary`,
        description: `Schema-level summary for database ${databaseName}.`,
        mimeType: "application/json",
      },
      readHandler
    );

    server.registerResource(
      `${databaseName}_foreign_keys`,
      `mssql://database/${encodeURIComponent(databaseName)}/foreign-keys`,
      {
        title: `${databaseName} Foreign Keys`,
        description: `Foreign key relationships for database ${databaseName}.`,
        mimeType: "application/json",
      },
      readHandler
    );
  }

  server.registerResource(
    "table_schema",
    new ResourceTemplate(resourceTemplates[0].uriTemplate, {
      list: async () => ({
        resources: (
          await Promise.all(
            context.allowedDatabases.map(async (databaseName) => {
              const tables = await getCachedValue(`tables:${databaseName}`, () =>
                listDatabaseTables(databaseName)
              );
              return tables.map((table) => ({
                uri: `mssql://table/${encodeURIComponent(databaseName)}/${encodeURIComponent(table.schemaName)}/${encodeURIComponent(table.tableName)}`,
                name: `${databaseName}.${table.schemaName}.${table.tableName}`,
              }));
            })
          )
        ).flat(),
      }),
      complete: {
        databaseName: (value) =>
          context.allowedDatabases.filter((databaseName) =>
            databaseName
              .toLowerCase()
              .startsWith(String(value ?? "").toLowerCase())
          ),
        schemaName: async (_value, variables) => {
          const databaseName = variables?.arguments?.databaseName;
          if (!databaseName) {
            return [];
          }
          const tables = await getCachedValue(`tables:${databaseName}`, () =>
            listDatabaseTables(databaseName)
          );
          return [...new Set(tables.map((table) => table.schemaName))];
        },
        tableName: async (value, variables) => {
          const databaseName = variables?.arguments?.databaseName;
          const schemaName = variables?.arguments?.schemaName;
          if (!databaseName) {
            return [];
          }
          const tables = await getCachedValue(`tables:${databaseName}`, () =>
            listDatabaseTables(databaseName, schemaName)
          );
          return tables
            .map((table) => table.tableName)
            .filter((tableName) =>
              tableName
                .toLowerCase()
                .startsWith(String(value ?? "").toLowerCase())
            );
        },
      },
    }),
    {
      title: "Table Schema",
      description: resourceTemplates[0].description,
      mimeType: resourceTemplates[0].mimeType,
    },
    readHandler
  );

  server.registerResource(
    "object_definition",
    new ResourceTemplate(resourceTemplates[1].uriTemplate, {
      list: async () => ({
        resources: (
          await Promise.all(
            context.allowedDatabases.map(async (databaseName) => {
              const objects = await getCachedValue(
                `objects:${databaseName}`,
                () => listDatabaseObjects(databaseName)
              );
              return objects.map((object) => ({
                uri: `mssql://object/${encodeURIComponent(databaseName)}/${encodeURIComponent(object.schemaName)}/${encodeURIComponent(object.name)}`,
                name: `${databaseName}.${object.schemaName}.${object.name}`,
              }));
            })
          )
        ).flat(),
      }),
      complete: {
        databaseName: (value) =>
          context.allowedDatabases.filter((databaseName) =>
            databaseName
              .toLowerCase()
              .startsWith(String(value ?? "").toLowerCase())
          ),
        schemaName: async (_value, variables) => {
          const databaseName = variables?.arguments?.databaseName;
          if (!databaseName) {
            return [];
          }
          const objects = await getCachedValue(`objects:${databaseName}`, () =>
            listDatabaseObjects(databaseName)
          );
          return [...new Set(objects.map((object) => object.schemaName))];
        },
        objectName: async (value, variables) => {
          const databaseName = variables?.arguments?.databaseName;
          const schemaName = variables?.arguments?.schemaName;
          if (!databaseName) {
            return [];
          }
          const objects = await getCachedValue(`objects:${databaseName}`, () =>
            listDatabaseObjects(databaseName, undefined, schemaName)
          );
          return objects
            .map((object) => object.name)
            .filter((name) =>
              name.toLowerCase().startsWith(String(value ?? "").toLowerCase())
            );
        },
      },
    }),
    {
      title: "Object Definition",
      description: resourceTemplates[1].description,
      mimeType: resourceTemplates[1].mimeType,
    },
    readHandler
  );

  server.registerResource(
    "object_dependencies",
    new ResourceTemplate(resourceTemplates[2].uriTemplate, {
      list: undefined,
    }),
    {
      title: "Object Dependencies",
      description: resourceTemplates[2].description,
      mimeType: resourceTemplates[2].mimeType,
    },
    readHandler
  );

  server.registerResource(
    "query_plan_resource",
    new ResourceTemplate("mssql://query-plan/{planId}", {
      list: async () => ({
        resources: context.state.listQueryPlans().map((plan) => ({
          uri: `mssql://query-plan/${plan.id}`,
          name: plan.id,
        })),
      }),
    }),
    {
      title: "Query Plans",
      description: "Stored query plan results generated by explain_query.",
      mimeType: "application/json",
    },
    readHandler
  );

  server.registerResource(
    "query_result_resource",
    new ResourceTemplate("mssql://query-result/{resultId}", {
      list: async () => ({
        resources: context.state.listQueryResults().map((result) => ({
          uri: `mssql://query-result/${result.id}`,
          name: result.label,
        })),
      }),
    }),
    {
      title: "Query Results",
      description: "Stored large query results generated by read/search tools.",
      mimeType: "application/json",
    },
    readHandler
  );

  for (const appName of [
    "query-plan-viewer",
    "schema-explorer",
    "result-grid",
    "write-preview",
  ]) {
    server.registerResource(
      appName,
      `ui://mssql/${appName}`,
      {
        title: appName,
        description: `MCP App resource for ${appName}.`,
        mimeType: "text/html;profile=mcp-app",
      },
      readHandler
    );
  }
}
