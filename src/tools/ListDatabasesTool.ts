import { listConfiguredDatabases } from "../schema.js";

function formatConfiguredDatabasesMessage(
  databases: Array<{ name: string; isDefault: boolean }>
): string {
  if (databases.length === 0) {
    return "No databases are configured. Set DATABASE_NAME or DATABASES in the environment.";
  }

  const labels = databases.map((d) =>
    d.isDefault ? `${d.name} (default)` : d.name
  );
  return `Configured databases (${databases.length}): ${labels.join(", ")}.`;
}

export class ListDatabasesTool {
  name = "list_databases";
  description = "Lists the databases this MCP server is configured to access.";

  async run() {
    const databases = listConfiguredDatabases();
    return {
      success: true,
      message: formatConfiguredDatabasesMessage(databases),
      data: databases,
      meta: {
        count: databases.length,
      },
    };
  }
}
