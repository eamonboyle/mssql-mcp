# Smoke test prompts — MSSQL MCP (database `test-mcp`)

Use with your MCP client; explicitly mention `test-mcp` and `dbo.Users` so `databaseName` / `schemaName` are passed consistently.

This file lives at the repository root and is not compiled into `dist` (build output is only from `src/`).

**Minimal subset (fast):** prompts 1, 2, 4, 7, 9, 11–13.

## Discovery & schema

1. Which databases can this MCP server use? Call the tool if you have it.  
   (`list_databases`)

2. List all tables in the `test-mcp` database.  
   (`list_table` + `databaseName`)

3. List tables, views, and procedures in `test-mcp`.  
   (`list_objects` + `databaseName`)

4. Describe the columns and types for `dbo.Users` in `test-mcp`.  
   (`describe_table`, `schemaName` `dbo`)

5. Summarize foreign keys involving `Users` in `test-mcp`.  
   (`list_foreign_keys`)

6. How is `dbo.Users` related to other tables in `test-mcp`?  
   (`describe_relationships` — may be empty; still valid)

## Analysis & plans

7. Run `analyze_table` on `dbo.Users` in `test-mcp` and summarize row count, nulls, and anything interesting.

8. Use `explain_query` on: `SELECT * FROM dbo.Users WHERE email LIKE N'%@%'` in `test-mcp`.

## Reads & search

9. Using `read_data`, show up to 5 rows from `dbo.Users` in `test-mcp`, ordered by `id`.

10. Using `search_data`, search `dbo.Users` in `test-mcp` on `email` and `first_name` for the term `test` and return at most 10 rows.

## Write path & previews (use safe filters, e.g. `id = -1` for no match)

11. Preview an update on `test-mcp` `dbo.Users`: set `first_name` to `Smoke` where `id = -1`. Use `preview_update`, show affected row count and sample rows.

12. Preview deletes on `test-mcp` `dbo.Users` where `id = -1` using `preview_delete`.

13. If the previews show 0 rows affected, run the same update with `confirmed: true` and the same filters, or explain why we should not run it.  
    (`update_data` + confirmation / preview gating; optional `schemaName` `dbo`)

14. Same pattern for delete only if you intend to delete: `preview_delete` first, then `delete_data` with `confirmed: true` and narrow filters.

## DDL (only with `ENABLE_DDL=true` on `test-mcp`)

15. If `ENABLE_DDL` is true, create a throwaway table `dbo.McpSmoke123` with one `id` int column in `test-mcp`, describe it, then drop it.

16. If `ENABLE_DDL` is false, try to create a table on `test-mcp` and confirm the server blocks DDL with a clear error.

## Structured results

17. For each tool you used, briefly quote `version`, `success`, and any `error.code` from the JSON if present.
