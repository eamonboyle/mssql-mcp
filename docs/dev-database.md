# Local Docker MSSQL for MCP development

This repo includes a Docker Compose stack that runs Microsoft SQL Server 2022 with an idempotent seed so you can exercise MCP tools against a real database.

## Prerequisites

- Docker Engine with the Compose plugin (`docker compose`)
- Node.js 18+

## Quick start

```bash
cp .env.example .env
npm run db:up          # start container + wait + seed
npm start              # stdio MCP server (loads .env via dotenv)
```

HTTP transport:

```bash
MCP_TRANSPORT=http npm start
# listens on http://127.0.0.1:3333
```

## npm scripts

| Script | What it does |
| --- | --- |
| `npm run db:up` | `docker compose up -d`, wait for readiness, apply seed |
| `npm run db:seed` | Re-apply `docker/mssql/init/*.sql` (idempotent) |
| `npm run db:down` | Stop the container (keeps the data volume) |
| `npm run db:reset` | Stop and wipe the data volume, then `db:up` again |

## Seeded schema

**AppDB**

- `dbo.Customers`, `dbo.Products`, `dbo.Orders`, `dbo.OrderItems` (with FKs)
- View `dbo.v_CustomerOrderSummary`
- Procedure `dbo.usp_GetCustomerOrders`

**ReportingDB**

- `dbo.DailySales`

Default login: `sa` / value of `MSSQL_SA_PASSWORD` (see `.env.example`). Host port defaults to `1433`.

## Useful MCP checks

Once the server is running against this DB, try:

- List tables / objects in `AppDB`
- `describe_relationships` around `Orders`
- `read_data` / `search_data` on `Customers`
- `preview_update` then confirmed `update_data` (write preview flow)
- Switch `databaseName` to `ReportingDB` for multi-DB coverage

## Full tool E2E harness

Run every registered MCP tool against the Docker database in one shot:

```bash
cp .env.example .env    # if needed
npm run test:e2e
```

This script (`scripts/e2e-mcp-tools.sh`):

1. Ensures `mssql-mcp-dev` is running (`npm run db:up` if not)
2. Builds the project
3. Starts a dedicated HTTP MCP server with `ENABLE_DDL=true` (DDL tools need this)
4. Runs `scripts/e2e-mcp-tools.mjs`, which calls each tool and prints PASS/FAIL per tool
5. Stops the server on exit

To run only the Node harness (server already running on port 3333):

```bash
MCP_TRANSPORT=http ENABLE_DDL=true npm start   # separate terminal
MCP_E2E_BASE_URL=http://127.0.0.1:3333/mcp node scripts/e2e-mcp-tools.mjs
```

See `AGENTS.md` for Cursor Cloud / Docker-in-Docker notes.
