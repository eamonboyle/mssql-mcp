import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  describeDatabaseObject,
  describeTableSchema,
  listDatabaseObjects,
  listDatabaseTables,
} from "./schema.js";
import { promptDefinitions } from "./promptRegistry.js";

interface ResourceTemplateDefinition {
  name: string;
  uriTemplate: string;
  description: string;
  mimeType: string;
}

export interface ResourceRegistryContext {
  serverName: string;
  serverVersion: string;
  isReadOnly: boolean;
  allowedDatabases: string[];
  toolNames: string[];
  maxRows: number;
  queryTimeoutMs: number;
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
];

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

async function readResourcePayload(
  uri: string,
  context: ResourceRegistryContext
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
        tables: await listDatabaseTables(databaseName),
      };
    }

    if (resourceName === "objects") {
      return {
        databaseName,
        objects: await listDatabaseObjects(databaseName),
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

  throw new Error(`Unknown resource URI: ${uri}`);
}

function buildReadHandler(context: ResourceRegistryContext) {
  return async (uri: URL) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: buildResourceText(await readResourcePayload(uri.href, context)),
      },
    ],
  });
}

export function registerResources(
  server: McpServer,
  context: ResourceRegistryContext
): void {
  const readHandler = buildReadHandler(context);

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
  }

  server.registerResource(
    "table_schema",
    new ResourceTemplate(resourceTemplates[0].uriTemplate, {
      list: async () => ({
        resources: (
          await Promise.all(
            context.allowedDatabases.map(async (databaseName) => {
              const tables = await listDatabaseTables(databaseName);
              return tables.map((table) => ({
                uri: `mssql://table/${encodeURIComponent(databaseName)}/${encodeURIComponent(table.schemaName)}/${encodeURIComponent(table.tableName)}`,
                name: `${databaseName}.${table.schemaName}.${table.tableName}`,
              }));
            })
          )
        ).flat(),
      }),
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
              const objects = await listDatabaseObjects(databaseName);
              return objects.map((object) => ({
                uri: `mssql://object/${encodeURIComponent(databaseName)}/${encodeURIComponent(object.schemaName)}/${encodeURIComponent(object.name)}`,
                name: `${databaseName}.${object.schemaName}.${object.name}`,
              }));
            })
          )
        ).flat(),
      }),
    }),
    {
      title: "Object Definition",
      description: resourceTemplates[1].description,
      mimeType: resourceTemplates[1].mimeType,
    },
    readHandler
  );
}
