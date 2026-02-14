# MSSQL MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

[![Add to Cursor](https://img.shields.io/badge/Add_to-Cursor-000000?style=for-the-badge&logo=cursor&logoColor=white)](cursor://anysphere.cursor-deeplink/mcp/install?name=MSSQL&config=eyJjb21tYW5kIjoibm9kZSIsImFyZ3MiOlsiL3BhdGgvdG8vbXNzcWwtbWNwL2Rpc3QvaW5kZXguanMiXSwiZW52Ijp7IlNFUlZFUl9OQU1FIjoibG9jYWxob3N0IiwiREFUQUJBU0VfTkFNRSI6IllvdXJEYXRhYmFzZSIsIkRCX1VTRVIiOiIiLCJEQl9QQVNTV09SRCI6IiIsIlJFQURPTkxZIjoiZmFsc2UifX0=)
[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](vscode://mcp/install?%7B%22name%22%3A%22mssql%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22node%22%2C%22args%22%3A%5B%22%2Fpath%2Fto%2Fmssql-mcp%2Fdist%2Findex.js%22%5D%2C%22env%22%3A%7B%22SERVER_NAME%22%3A%22localhost%22%2C%22DATABASE_NAME%22%3A%22YourDatabase%22%2C%22DB_USER%22%3A%22%22%2C%22DB_PASSWORD%22%3A%22%22%2C%22READONLY%22%3A%22false%22%7D%7D)

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
- **CRUD operations** — Create, read, update, and delete data
- **Schema management** — Create tables, indexes; describe and drop tables
- **Multi-database support** — Connect to multiple databases on the same server
- **Read-only mode** — Restrict to SELECT-only for safer environments
- **Secure by default** — WHERE clauses required for reads/updates; SQL injection safeguards

## Supported AI Clients

- [Claude Desktop](https://claude.ai/)
- [Cursor](https://cursor.com/) (VS Code with AI)
- [VS Code Agent](https://marketplace.visualstudio.com/items?itemName=Anthropic.anthropic-vscode) extension
- Any MCP-compatible client

## Quick Start 🚀

### One-Click Install (Cursor / VS Code)

Click **Add to Cursor** or **Install in VS Code** above to add the MCP server. After cloning and building (see below), edit the config to set the path to your `dist/index.js` and add your database credentials.

### Prerequisites

- **Node.js 18** or higher
- SQL Server (local, Azure SQL, or remote)
- An MCP-compatible AI client (Claude Desktop, Cursor, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/mssql-mcp.git
cd mssql-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

> **If you used the install buttons:** Update the server config path from `/path/to/mssql-mcp` to your actual project path (e.g. `C:\Users\You\mssql-mcp` on Windows).

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVER_NAME` | Yes | SQL Server host (e.g., `localhost`, `my-server.database.windows.net`) |
| `DATABASE_NAME` | Yes | Default database name |
| `DB_USER` | Yes* | SQL Server username (for SQL authentication) |
| `DB_PASSWORD` | Yes* | SQL Server password (for SQL authentication) |
| `READONLY` | No | `"true"` for read-only mode, `"false"` for full access (default: `"false"`) |
| `DATABASES` | No | Comma-separated list for multi-database access (e.g., `ProdDB,StagingDB`) |
| `CONNECTION_TIMEOUT` | No | Timeout in seconds (default: `30`) |
| `TRUST_SERVER_CERTIFICATE` | No | `"true"` for self-signed certs (e.g., local dev) (default: `"false"`) |

\* Required for SQL authentication. For Windows/Integrated authentication, consult the [mssql](https://www.npmjs.com/package/mssql) package documentation.

### Option 1: Cursor / VS Code Setup

1. Create or edit `.vscode/mcp.json` in your workspace:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["/absolute/path/to/mssql-mcp/dist/index.js"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "YourDatabase",
        "DB_USER": "your_username",
        "DB_PASSWORD": "your_password",
        "READONLY": "false"
      }
    }
  }
}
```

2. Replace `/absolute/path/to/mssql-mcp` with the actual path to this project.
3. Restart Cursor/VS Code.

### Option 2: Claude Desktop Setup

1. Open **File → Settings → Developer → Edit Config**
2. Add the MCP server configuration:

```json
{
  "mcpServers": {
    "mssql": {
      "command": "node",
      "args": ["/absolute/path/to/mssql-mcp/dist/index.js"],
      "env": {
        "SERVER_NAME": "localhost",
        "DATABASE_NAME": "YourDatabase",
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

All tools accept an optional `databaseName` parameter. When omitted, `DATABASE_NAME` is used.

## Sample Configurations

See `src/samples/` for example configs:

- `claude_desktop_config.json` — Claude Desktop
- `vscode_agent_config.json` — VS Code Agent

## Usage Examples

Once configured, you can ask things like:

- "Show me all users from New York"
- "Create a new table called products with columns for id, name, and price"
- "Update all pending orders to completed status"
- "List all tables in the database"
- "Describe the schema of the customers table"

## Available Tools

| Tool | Read-only | Description |
|------|-----------|-------------|
| `read_data` | ✓ | Execute SELECT queries |
| `list_table` | ✓ | List tables in a database |
| `describe_table` | ✓ | Get table schema |
| `insert_data` | | Insert rows |
| `update_data` | | Update rows (requires WHERE) |
| `create_table` | | Create tables |
| `create_index` | | Create indexes |
| `drop_table` | | Drop tables |

## Security Notes

- **Credentials** — Never commit `DB_USER`/`DB_PASSWORD` or config files with secrets. Use environment variables or a secrets manager.
- **Read-only mode** — Set `READONLY: "true"` when you only need queries.
- **WHERE clauses** — Read and update operations require explicit WHERE clauses to reduce accidental full-table operations.
- **SQL injection** — The server validates and restricts dangerous SQL patterns.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License — see [LICENSE](LICENSE) for details.
