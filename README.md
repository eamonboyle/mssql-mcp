# MSSQL MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm version](https://img.shields.io/npm/v/@eamonboyle/mssql-mcp.svg)](https://www.npmjs.com/package/@eamonboyle/mssql-mcp)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)
[![X: @eamonyo](https://img.shields.io/badge/X-%40eamonyo-000000?style=flat-square&logo=x&logoColor=white)](https://x.com/eamonyo)

[![Add to Cursor](https://img.shields.io/badge/Add_to-Cursor-000000?style=for-the-badge&logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=MSSQL&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBlYW1vbmJveWxlL21zc3FsLW1jcCJdLCJlbnYiOnsiU0VSVkVSX05BTUUiOiJsb2NhbGhvc3QiLCJEQVRBQkFTRV9OQU1FIjoiWW91ckRhdGFiYXNlIiwiREFUQUJBU0VTIjoiIiwiREJfVVNFUiI6IiIsIkRCX1BBU1NXT1JEIjoiIiwiUkVBRE9OTFkiOiJmYWxzZSIsIkNPTk5FQ1RJT05fVElNRU9VVCI6IjMwIiwiUVVFUllfVElNRU9VVF9NUyI6IjMwMDAwIiwiTUFYX1JPV1MiOiIxMDAwMCIsIlRSVVNUX1NFUlZFUl9DRVJUSUZJQ0FURSI6ImZhbHNlIiwiTUNQX1RSQU5TUE9SVCI6InN0ZGlvIiwiTUNQX0hUVFBfSE9TVCI6IjEyNy4wLjAuMSIsIk1DUF9IVFRQX1BPUlQiOiIzMzMzIiwiTUNQX0JBU0VfVVJMIjoiIiwiRU5BQkxFX0RETCI6ImZhbHNlIiwiTUFYX1dSSVRFX1JPV1MiOiIxMDAiLCJSRVFVSVJFX1dSSVRFX1BSRVZJRVciOiJ0cnVlIn19)
[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](https://intradeus.github.io/http-protocol-redirector?r=vscode%3Amcp%2Finstall%3F%257B%2522name%2522%253A%2522mssql%2522%252C%2522command%2522%253A%2522npx%2522%252C%2522args%2522%253A%255B%2522-y%2522%252C%2522%2540eamonboyle%252Fmssql-mcp%2522%255D%252C%2522env%2522%253A%257B%2522SERVER_NAME%2522%253A%2522localhost%2522%252C%2522DATABASE_NAME%2522%253A%2522YourDatabase%2522%252C%2522DATABASES%2522%253A%2522%2522%252C%2522DB_USER%2522%253A%2522%2522%252C%2522DB_PASSWORD%2522%253A%2522%2522%252C%2522READONLY%2522%253A%2522false%2522%252C%2522CONNECTION_TIMEOUT%2522%253A%252230%2522%252C%2522QUERY_TIMEOUT_MS%2522%253A%252230000%2522%252C%2522MAX_ROWS%2522%253A%252210000%2522%252C%2522TRUST_SERVER_CERTIFICATE%2522%253A%2522false%2522%252C%2522MCP_TRANSPORT%2522%253A%2522stdio%2522%252C%2522MCP_HTTP_HOST%2522%253A%2522127.0.0.1%2522%252C%2522MCP_HTTP_PORT%2522%253A%25223333%2522%252C%2522MCP_BASE_URL%2522%253A%2522%2522%252C%2522ENABLE_DDL%2522%253A%2522false%2522%252C%2522MAX_WRITE_ROWS%2522%253A%2522100%2522%252C%2522REQUIRE_WRITE_PREVIEW%2522%253A%2522true%2522%257D%257D)

> ⚠️ **EXPERIMENTAL USE ONLY** — This MCP Server is provided for educational and experimental purposes. It is NOT intended for production use. Use appropriate security measures and test thoroughly before any deployment.

## What is this? 🤔

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that lets AI assistants like Claude, Cursor, and other LLM-powered tools query and manage your Microsoft SQL Server database using natural language.

### Quick Example

```
You: "Show me all customers from New York"
AI: *queries your MSSQL database and returns the results in plain English*
```

## Features 📊

- **Natural language to SQL** — Ask questions in plain English
- **Row-level CRUD support** — Read, insert, update, and delete rows with dedicated tools
- **Structured filtering** — `filter_data` uses the same safe filter DSL as update/delete (no raw SQL required)
- **Schema discovery** — Inspect tables, views, procedures, functions, and triggers; summarize counts with `summarize_schema`
- **Dependency impact analysis** — `describe_dependencies` before drops or refactors
- **Safer write workflows** — `preview_update` and `preview_delete` plus confirmation gating for destructive tools
- **Rich text tool results** — Concise summaries with JSON inlined in the primary text block when helpful, plus resource links for large artifacts
- **Query analysis** — Generate estimated execution plans with `explain_query`
- **MCP resources and prompts** — Expose schema snapshots, query artifacts, and prompt templates to capable clients
- **Remote transport support** — Run locally over `stdio` or remotely over Streamable HTTP
- **Multi-database support** — Connect to multiple databases on the same server
- **Read-only mode** — Restrict to inspection, search, read, and explain tools for safer environments
- **Secure by default** — WHERE clauses required for updates/deletes; SQL injection safeguards for reads; DDL tools off unless `ENABLE_DDL=true`

## Supported AI Clients

- [Claude Desktop](https://claude.ai/)
- [Cursor](https://cursor.com/) (VS Code with AI)
- [VS Code Agent](https://marketplace.visualstudio.com/items?itemName=Anthropic.anthropic-vscode) extension
- Any MCP-compatible client

## Quick Start 🚀

### One-Click Install (Cursor / VS Code)

Click **Add to Cursor** or **Install in VS Code** above to add the MCP server—no cloning required; it runs via `npx`.

**Cursor** opens a dedicated install page that lists env vars you can edit before saving (similar to a short form). The **Add to Cursor** preset includes every variable from the table below (connection, timeouts, **`ENABLE_DDL`** defaulting to **`false`**, write caps, **`MCP_TRANSPORT`** / HTTP settings, **`MCP_BASE_URL`**, etc.); set **`ENABLE_DDL`** to **`true`** there if you want schema tools.

**VS Code** only applies the JSON embedded in the `vscode:mcp/install` link: you get static placeholder values, not an interactive database wizard. To be prompted for host, database, and credentials when the server starts, add [`inputs`](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration#_input-variables-for-sensitive-data) to `.vscode/mcp.json` as in the **Prompted inputs** example under **VS Code (`mcp.json`)** below.

### Prerequisites

- **Node.js 18** or higher
- SQL Server (local, Azure SQL, or remote)
- An MCP-compatible AI client (Claude Desktop, Cursor, etc.)

### Installation

**From npm** (recommended):

```bash
npx -y @eamonboyle/mssql-mcp
```

Or install globally: `npm install -g @eamonboyle/mssql-mcp`

**From source** (for development):

```bash
git clone https://github.com/eamonboyle/mssql-mcp.git
cd mssql-mcp
npm install
npm run build
```

## Configuration

### Environment Variables

| Variable                   | Required | Description                                                                          |
| -------------------------- | -------- | ------------------------------------------------------------------------------------ |
| `SERVER_NAME`              | Yes      | SQL Server host (e.g., `localhost`, `my-server.database.windows.net`)                |
| `DATABASE_NAME`            | Yes\*\*  | Default database name. Optional when `DATABASES` is set.                             |
| `DB_USER`                  | Yes\*    | SQL Server username (for SQL authentication)                                         |
| `DB_PASSWORD`              | Yes\*    | SQL Server password (for SQL authentication)                                         |
| `READONLY`                 | No       | `"true"` for read-only mode, `"false"` for full access (default: `"false"`)          |
| `DATABASES`                | No       | Comma-separated allowlist for multi-database access (e.g., `ProdDB,StagingDB`)       |
| `CONNECTION_TIMEOUT`       | No       | Timeout in seconds (default: `30`)                                                   |
| `QUERY_TIMEOUT_MS`         | No       | Query timeout in milliseconds (default: `30000`)                                     |
| `MAX_ROWS`                 | No       | Maximum rows returned by read tools (default: `10000`)                               |
| `TRUST_SERVER_CERTIFICATE` | No       | `"true"` for self-signed certs (e.g., local dev) (default: `"false"`)                |
| `MCP_TRANSPORT`            | No       | `stdio` (default) or `http`                                                          |
| `MCP_HTTP_HOST`            | No       | Bind host for Streamable HTTP mode (default: `127.0.0.1`)                            |
| `MCP_HTTP_PORT`            | No       | Bind port for Streamable HTTP mode (default: `3333`)                                 |
| `MCP_BASE_URL`             | No       | Optional externally visible base URL for remote deployments                          |
| `ENABLE_DDL`               | No       | `"true"` enables `create_table`, `create_index`, and `drop_table` (default: `false`) |
| `MAX_WRITE_ROWS`           | No       | Maximum rows a single write tool may affect before it is blocked (default: `100`)    |
| `REQUIRE_WRITE_PREVIEW`    | No       | `"true"` (default): call `preview_update` / `preview_delete`, then pass the returned `previewToken` with `confirmed=true` on `update_data` / `delete_data`. Set `"false"` to skip the token (confirmation still applies). |

\* Required for SQL authentication. For Windows/Integrated authentication, consult the [mssql](https://www.npmjs.com/package/mssql) package documentation.

\*\* Required for single-database setups. When `DATABASES` is provided, `DATABASE_NAME` becomes optional and is used as the default database if set.

### Cursor (`mcp.json`)

Use [global or project MCP config](https://cursor.com/docs/context/mcp): e.g. `~/.cursor/mcp.json` or `.cursor/mcp.json` in your repo.

```json
{
  "mcpServers": {
    "mssql": {
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "AppDB",
        "DATABASES": "AppDB,ReportingDB",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "READONLY": "false"
      }
    }
  }
}
```

Restart Cursor after changes.

### Cursor HTTP MCP

To expose the server remotely over Streamable HTTP:

```json
{
  "mcpServers": {
    "mssql-http": {
      "url": "http://127.0.0.1:3333"
    }
  }
}
```

Run the server with:

```bash
MCP_TRANSPORT=http MCP_HTTP_HOST=127.0.0.1 MCP_HTTP_PORT=3333 npx -y @eamonboyle/mssql-mcp
```

### VS Code (`mcp.json`)

VS Code uses `.vscode/mcp.json` (or **MCP: Open User Configuration**) with a top-level [`servers`](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration) object—**not** `mcpServers`.

**Static env** (same idea as the one-click link; edit values in the file):

```json
{
  "servers": {
    "mssql": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "AppDB",
        "DATABASES": "AppDB,ReportingDB",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "READONLY": "false",
        "CONNECTION_TIMEOUT": "30",
        "QUERY_TIMEOUT_MS": "30000",
        "MAX_ROWS": "10000",
        "TRUST_SERVER_CERTIFICATE": "false"
      }
    }
  }
}
```

**Prompted inputs** (closest to Cursor’s hosted form: VS Code asks on first start, then stores values). Use `${input:…}` in `env` and define matching entries under `inputs`:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "mssql-server",
      "description": "SQL Server host (e.g. localhost or my-server.database.windows.net)"
    },
    {
      "type": "promptString",
      "id": "mssql-database",
      "description": "Default database name"
    },
    {
      "type": "promptString",
      "id": "mssql-databases",
      "description": "Optional: comma-separated DB allowlist (e.g. AppDB,ReportingDB). Leave empty for a single database."
    },
    {
      "type": "promptString",
      "id": "mssql-user",
      "description": "SQL Server login (SQL authentication)"
    },
    {
      "type": "promptString",
      "id": "mssql-password",
      "description": "SQL Server password",
      "password": true
    }
  ],
  "servers": {
    "mssql": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "${input:mssql-server}",
        "DATABASE_NAME": "${input:mssql-database}",
        "DATABASES": "${input:mssql-databases}",
        "DB_USER": "${input:mssql-user}",
        "DB_PASSWORD": "${input:mssql-password}",
        "READONLY": "false",
        "CONNECTION_TIMEOUT": "30",
        "QUERY_TIMEOUT_MS": "30000",
        "MAX_ROWS": "10000",
        "TRUST_SERVER_CERTIFICATE": "false"
      }
    }
  }
}
```

### Claude Desktop Setup

1. Open **File → Settings → Developer → Edit Config**
2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "npx",
      "args": ["-y", "@eamonboyle/mssql-mcp"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "AppDB",
        "DATABASES": "AppDB,ReportingDB",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "READONLY": "false"
      }
    }
  }
}
```

3. Restart Claude Desktop.

### Multi-Database Support

To allow queries across multiple databases:

```json
"env": {
  "SERVER_NAME": "your-server.database.windows.net",
  "DATABASE_NAME": "ProdDB",
  "DATABASES": "ProdDB,StagingDB,AnalyticsDB",
  "DB_USER": "your_username",
  "DB_PASSWORD": "your_password",
  "READONLY": "false"
}
```

`DATABASES` defines which databases the MCP can access. All tools accept an optional `databaseName` parameter. When omitted, the server uses `DATABASE_NAME` if it is included in `DATABASES`; otherwise it falls back to the first entry in `DATABASES`.

## Sample Configurations

See `src/samples/` for example configs:

- `claude_desktop_config.json` — Claude Desktop
- `vscode_agent_config.json` — VS Code Agent

## Usage Examples

Once configured, you can ask things like:

- "Show me all users from New York"
- "List the configured databases this MCP can access"
- "Preview the rows that would be updated before changing status to archived"
- "Explain this query and open the execution plan viewer"
- "Show the foreign keys and relationships around dbo.Orders"
- "Search the customers table for email addresses containing acme.com"
- "Create a new table called products with columns for id, name, and price"
- "Update all pending orders to completed status"
- "Delete inactive sessions older than 30 days"
- "List all tables in the database"
- "Describe the schema of the customers table"
- "List all views and procedures in the reporting database"
- "Explain why this SELECT query is slow"

## Available Tools

| Tool                     | Read-only | Description                                                                 |
| ------------------------ | --------- | --------------------------------------------------------------------------- |
| `list_databases`         | ✓         | List configured/allowed databases                                           |
| `list_table`             | ✓         | List tables in a database                                                   |
| `describe_table`         | ✓         | Get table schema (optional `schemaName`)                                    |
| `list_objects`           | ✓         | List tables, views, procedures, functions, and triggers                     |
| `describe_object`        | ✓         | Describe an object definition and metadata                                  |
| `summarize_schema`       | ✓         | High-level object counts by type and per schema                             |
| `list_foreign_keys`      | ✓         | List foreign key relationships                                              |
| `describe_relationships` | ✓         | Foreign keys involving a specific table                                     |
| `describe_dependencies`  | ✓         | Objects that depend on a given object                                       |
| `analyze_table`          | ✓         | Row counts, storage, and indexes for a table                                |
| `read_data`              | ✓         | Execute validated SELECT queries                                            |
| `filter_data`            | ✓         | Structured AND filters (same DSL as writes); optional `orderBy`/`offset`    |
| `search_data`            | ✓         | Search one or more columns with parameterized `LIKE`                        |
| `explain_query`          | ✓         | Get an estimated execution plan for a SELECT query                          |
| `preview_update`         | ✓         | Preview rows that would be updated; returns `previewToken` when required    |
| `preview_delete`         | ✓         | Preview rows that would be deleted; returns `previewToken` when required    |
| `insert_data`            |           | Insert rows (optional `schemaName`)                                         |
| `update_data`            |           | Update rows (requires filters; optional `schemaName`)                       |
| `delete_data`            |           | Delete rows (requires filters; optional `schemaName`)                       |
| `create_table`           |           | Create tables (requires `ENABLE_DDL=true`)                                  |
| `create_index`           |           | Create indexes (requires `ENABLE_DDL=true`)                                 |
| `drop_table`             |           | Drop tables (requires `ENABLE_DDL=true`; optional `schemaName`)             |

## Resources And Prompts

Clients that support MCP resources and prompts can use additional discovery surfaces:

- **Resources** — Server config, prompt catalog, per-database table lists, per-database object lists, and dynamic table/object resources
- **Prompts** — `explore_schema`, `draft_safe_select`, and `review_write_operation`

## Changelog

Release notes: [CHANGELOG.md](https://github.com/eamonboyle/mssql-mcp/blob/main/CHANGELOG.md).

## Security Notes

- **Credentials** — Never commit `DB_USER`/`DB_PASSWORD` or config files with secrets. Use environment variables or a secrets manager.
- **Read-only mode** — Set `READONLY: "true"` when you only need queries.
- **WHERE clauses** — Update and delete operations require explicit WHERE clauses to reduce accidental full-table changes.
- **SQL injection** — The server validates and restricts dangerous SQL patterns.
- **DDL tools** — Disabled by default (`ENABLE_DDL` unset or `false`). Set `ENABLE_DDL=true` only if the assistant should create/drop tables or indexes.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. By participating, you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT License — see [LICENSE](LICENSE) for details.
