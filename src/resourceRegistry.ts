import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
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
  transport: "stdio" | "http";
  publicEndpoint?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  enableDdl: boolean;
  requireWritePreview: boolean;
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

function buildResourceText(payload: unknown) {
  return JSON.stringify(payload, null, 2);
}

function parseResourceUri(uri: string) {
  const parsed = new URL(uri);
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

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
          transport: context.transport,
          publicEndpoint: context.publicEndpoint,
          encrypt: context.encrypt,
          trustServerCertificate: context.trustServerCertificate,
          enableDdl: context.enableDdl,
          requireWritePreview: context.requireWritePreview,
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

  if (
    parsed.resourceType === "database" &&
    parsed.segments[1] === "object" &&
    parsed.segments[4] === "dependencies"
  ) {
    const [databaseName, _objectKeyword, schemaName, objectName] =
      parsed.segments;
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
  return async (uri: URL) => {
    const payload = await readResourcePayload(
      uri.href,
      context,
      getCachedValue
    );

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: buildResourceText(payload),
        },
      ],
    };
  };
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
        description: `Tables, views, procedures, functions, and triggers available in database ${databaseName}.`,
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
              const tables = await getCachedValue(
                `tables:${databaseName}`,
                () => listDatabaseTables(databaseName)
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
}
