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
      "Review a proposed INSERT, UPDATE, DELETE, or DDL change before execution.",
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

export function registerPrompts(server: McpServer): void {
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
      (args) => {
        switch (prompt.name) {
          case "explore_schema":
            return {
              description: "Inspect the schema before answering or generating SQL.",
              messages: [
                buildPromptMessage(
                  `Inspect the SQL Server schema before answering the request.\nGoal: ${args.goal ?? "Understand the database shape"}\nDatabase: ${args.databaseName ?? "default configured database"}\nUse list_objects or list_table first, then describe_object or describe_table before writing SQL.`
                ),
              ],
            };
          case "draft_safe_select":
            return {
              description:
                "Draft a read-only SQL workflow that inspects schema before querying data.",
              messages: [
                buildPromptMessage(
                  `Answer this database question safely: ${args.question ?? "No question provided"}\nDatabase: ${args.databaseName ?? "default configured database"}\nInspect relevant schema first, then use read_data or search_data. Keep the final SQL read-only and explain assumptions.`
                ),
              ],
            };
          case "review_write_operation":
            return {
              description:
                "Review a proposed change and identify safety checks before running it.",
              messages: [
                buildPromptMessage(
                  `Review this proposed change before execution: ${args.operation ?? "No operation provided"}\nDatabase: ${args.databaseName ?? "default configured database"}\nConfirm the target objects, verify WHERE clauses where applicable, and suggest preview queries before any write tool is used.`
                ),
              ],
            };
          default:
            throw new Error(`Unknown prompt: ${prompt.name}`);
        }
      }
    );
  }
}
