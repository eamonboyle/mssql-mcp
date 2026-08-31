# Discover schema

Discover schema lets a client list configured databases, inspect tables and objects in AppDB, follow foreign keys, and read the same facts through MCP resources and the `explore_schema` prompt.

## Sub-features

- `schema-list-databases` lists AppDB and ReportingDB from `list_databases`.
- `schema-list-tables` lists `dbo.Customers` from `list_table`.
- `schema-describe-table` returns columns for `dbo.Customers`.
- `schema-list-objects` includes view `v_CustomerOrderSummary` and procedure `usp_GetCustomerOrders`.
- `schema-relationships` returns foreign keys involving `dbo.Orders`.
- `schema-resource` reads `mssql://table/AppDB/dbo/Customers` and `mssql://config/server`.
- `schema-prompt` returns the `explore_schema` prompt text.

## How to get to it (user POV)

- Call `list_databases`, then `list_table` or `list_objects`, then `describe_table` or `describe_object`.
- Call `summarize_schema`, `list_foreign_keys`, `describe_relationships`, or `describe_dependencies`.
- Read resource `mssql://config/server`, `mssql://database/AppDB/tables`, or `mssql://table/AppDB/dbo/Customers`.
- Get prompt `explore_schema` with argument `goal`.

## Driving it with mcp-rpc

Preconditions:

- Doctor passed against `http://127.0.0.1:3334/mcp`.
- Seeded AppDB contains `dbo.Customers`, `dbo.Orders`, `dbo.v_CustomerOrderSummary`, and `dbo.usp_GetCustomerOrders`.

- **List databases.** Ask which databases the server allows. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/list-databases.json --contains AppDB --contains ReportingDB tools/call list_databases '{}'`. `payload.success` is true and `payload.data` includes those two names.
- **List tables.** List tables in AppDB. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/list-table.json --contains dbo.Customers tools/call list_table '{"databaseName":"AppDB"}'`. `payload.data` includes `{ "name": "dbo.Customers" }`.
- **Describe table.** Describe `Customers`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/describe-table.json --contains Email tools/call describe_table '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Customers"}'`. `payload.data` is a column array that includes `Id`, `Name`, and `Email`.
- **List objects.** List views and procedures. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/list-objects.json --contains v_CustomerOrderSummary --contains usp_GetCustomerOrders tools/call list_objects '{"databaseName":"AppDB"}'`.
- **Describe object.** Describe the summary view. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/describe-object.json --contains v_CustomerOrderSummary tools/call describe_object '{"databaseName":"AppDB","schemaName":"dbo","objectName":"v_CustomerOrderSummary","objectTypes":["view"]}'`. `payload.data.name` is `v_CustomerOrderSummary`.
- **Relationships.** Describe keys on `Orders`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/describe-relationships.json --contains Customers tools/call describe_relationships '{"databaseName":"AppDB","schemaName":"dbo","tableName":"Orders"}'`.
- **Dependencies.** List dependents of `Customers`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/describe-dependencies.json tools/call describe_dependencies '{"databaseName":"AppDB","schemaName":"dbo","objectName":"Customers"}'`. `payload.success` is true.
- **Summarize schema.** Count object types. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/summarize-schema.json tools/call summarize_schema '{"databaseName":"AppDB"}'`. `payload.data.objectCounts` is a nonempty array.
- **Foreign keys.** List FKs in `dbo`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/list-foreign-keys.json --contains FK_Orders_Customers tools/call list_foreign_keys '{"databaseName":"AppDB","schemaName":"dbo"}'`.
- **Config resource.** Read server config. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/config-server.json --contains '"transport": "http"' resources/read mssql://config/server`.
- **Table resource.** Read table schema without a tool. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/table-resource.json --contains Email resources/read mssql://table/AppDB/dbo/Customers`.
- **Explore prompt.** Get `explore_schema`. Run `node .cursor/skills/verify-mssql-mcp/scripts/mcp-rpc.mjs --out /tmp/verify-mssql-mcp/evidence/discover-schema/explore-schema-prompt.json --contains list_table prompts/get explore_schema '{"goal":"inspect AppDB before writing SQL","databaseName":"AppDB"}'`. The prompt message tells the model to inspect schema first.
- **Proof.** Keep `list-databases.json`, `describe-table.json`, and `table-resource.json`. All three identify AppDB `Customers` and the Email column.

## Gotchas

- `list_table` is the tool name. `list_tables` does not exist.
- `list_table` filters schemas with `parameters`, an array of schema names, not `schemaName`.
- Resource listings cache for 30 seconds. A table created in the same run may be missing from `mssql://database/AppDB/tables` until that window passes. `describe_table` is live.
- `docs/smoke-test-prompts-test-mcp.md` targets database `test-mcp`. The Docker seed used here is `AppDB` plus `ReportingDB`.
- Prompt `explore_schema` requires `goal`. Omitting it still returns a template with a default goal string. Pass a real goal so the artifact matches the intended question.
