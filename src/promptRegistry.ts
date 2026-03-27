import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export interface PromptDefinition {
  name: string;
  description: string;
  arguments?: Array<{
    name: string;
    description: string;
    required?: boolean;
  }>;
}

export const promptDefinitions: PromptDefinition[] = [
  {
    name: "explore_schema",
    description:
      "Guide the assistant to inspect SQL Server schema before answering a database question.",
    arguments: [
      {
        name: "goal",
        description: "What you want to understand or build from the schema.",
        required: true,
      },
      {
        name: "databaseName",
        description: "Configured database to inspect first.",
      },
    ],
  },
  {
    name: "draft_safe_select",
    description:
      "Draft a safe read-only SQL workflow using schema inspection before running a SELECT.",
    arguments: [
      {
        name: "question",
        description: "Business question to answer with SQL.",
        required: true,
      },
      {
        name: "databaseName",
        description: "Configured database to inspect first.",
      },
    ],
  },
  {
    name: "review_write_operation",
    description:
      "Review a proposed INSERT, UPDATE, DELETE, or DDL change before execution. When the server is read-only, directs the assistant to stop and avoid terminal or external SQL clients.",
    arguments: [
      {
        name: "operation",
        description: "The change you want to make.",
        required: true,
      },
      {
        name: "databaseName",
        description: "Configured database the change targets.",
      },
    ],
  },
];

function buildPromptMessage(text: string) {
  return {
    role: "user" as const,
    content: {
      type: "text" as const,
      text,
    },
  };
}

export interface RegisterPromptsOptions {
  isReadOnly: boolean;
}

function createPromptMessageBuilders(isReadOnly: boolean) {
  return {
    explore_schema: (args: Record<string, string | undefined>) => ({
      description: "Inspect the schema before answering or generating SQL.",
      messages: [
        buildPromptMessage(
          `Inspect the SQL Server schema before answering the request.\nGoal: ${args.goal ?? "Understand the database shape"}\nDatabase: ${args.databaseName ?? "default configured database"}\nUse list_objects or list_table first, then describe_object or describe_table before writing SQL.`
        ),
      ],
    }),
    draft_safe_select: (args: Record<string, string | undefined>) => ({
      description:
        "Draft a read-only SQL workflow that inspects schema before querying data.",
      messages: [
        buildPromptMessage(
          `Answer this database question safely: ${args.question ?? "No question provided"}\nDatabase: ${args.databaseName ?? "default configured database"}\nInspect relevant schema first, then use read_data or search_data. Keep the final SQL read-only and explain assumptions.`
        ),
      ],
    }),
    review_write_operation: (args: Record<string, string | undefined>) => {
      const operation = args.operation ?? "No operation provided";
      const database = args.databaseName ?? "default configured database";

      const body = isReadOnly
        ? `Review this proposed change: ${operation}\nDatabase: ${database}

This MCP SQL Server connection is read-only (confirm with resource mssql://config/server — readOnly should be true). Write tools such as delete_data, update_data, insert_data, and DDL tools are not available.

STOP: Do not execute this change through the assistant. Do not open a terminal or use sqlcmd, SSMS, Azure Data Studio, PowerShell SQL cmdlets, ODBC/JDBC one-off scripts, or any other database client to apply INSERT, UPDATE, DELETE, or DDL as a workaround. Tell the user their MCP server is read-only and they must turn off READONLY (or run the change themselves manually outside this assistant) if they want execution here.

You may still: outline risks, confirm keys and scope, and suggest read-only preview SELECTs for discussion only.`
        : `Review this proposed change before execution: ${operation}\nDatabase: ${database}\nConfirm the target objects, verify WHERE clauses where applicable, and suggest preview queries before any write tool is used.`;

      return {
        description:
          "Review a proposed change and identify safety checks before running it.",
        messages: [buildPromptMessage(body)],
      };
    },
  } satisfies Record<
    (typeof promptDefinitions)[number]["name"],
    (args: Record<string, string | undefined>) => {
      description: string;
      messages: ReturnType<typeof buildPromptMessage>[];
    }
  >;
}

export function registerPrompts(
  server: McpServer,
  options: RegisterPromptsOptions
): void {
  const promptMessageBuilders = createPromptMessageBuilders(options.isReadOnly);

  for (const prompt of promptDefinitions) {
    const argsShape = Object.fromEntries(
      (prompt.arguments ?? []).map((argument) => [
        argument.name,
        argument.required
          ? z.string().describe(argument.description)
          : z.string().describe(argument.description).optional(),
      ])
    );

    server.registerPrompt(
      prompt.name,
      {
        title: prompt.name,
        description: prompt.description,
        argsSchema: argsShape,
      },
      (args) =>
        promptMessageBuilders[prompt.name as keyof typeof promptMessageBuilders](
          args
        )
    );
  }
}
