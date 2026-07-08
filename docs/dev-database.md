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
