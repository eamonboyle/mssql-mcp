# PR #21 Re-review Report

**PR:** #21 — Add SQL Server port, TLS, and public endpoint configuration
**Branch:** `cursor/connection-config-presets-3407` (reviewed at `796153f` vs `main`)
**Date:** 2026-07-12
**Verdict:** One remaining compatibility blocker, three medium issues; everything else is clean.

Reviewed the full `main...HEAD` diff against the acceptance criteria in
[`pr-21-rereview-brief.md`](pr-21-rereview-brief.md). Independently re-ran
`npm run build`, `npm run lint`, and `npm test` (156/156 pass) and probed the
built `dist/config.js` directly to confirm the compatibility behaviors below.
`git diff --check main...HEAD` exits 0.

## What checks out against the acceptance criteria

- **Database selection** matches the spec exactly (`src/config.ts:198-213`):
  `DATABASE_NAME`-only, `DATABASES`-only, both-set (with out-of-allowlist
  fallback to the first entry), and neither-set → actionable error. All four
  paths have tests, and allowlist rejection is intact (`src/db.ts:55-63`).
- **Boolean defaults** are preserved for omitted vars (`READONLY=false`,
  `ENABLE_DDL=false`, `TRUST_SERVER_CERTIFICATE=true`, `ENCRYPT=false`),
  explicit `TRUST_SERVER_CERTIFICATE=false` is now honored (`src/db.ts:77`,
  with a test), and `READONLY=yes` fails with exactly the specified message.
- **Startup snapshot**: pools are built from the config captured by
  `configureSqlConnection` (`src/db.ts:131`, `src/db.ts:170`), and the db test
  that mutates `SERVER_NAME` after startup proves env changes are ignored for
  connections. Pool creation does not revalidate transport settings.
- **`SERVER_PORT`** is optional, passed separately as `port`, omitted from the
  driver config when unset, and `SERVER_NAME` is never split — all covered by
  tests, including `"localhost,1434"` passthrough.
- **Versioning**: `package.json`, lockfile, `SERVER_VERSION`
  (`src/index.ts:35`), tests, and changelog all say 1.6.0; the changelog is
  not framed as breaking.
- **`[rowCount]` fix** is present in both `listLargestTables` and
  `analyzeTable`, each with a regression test.
- **Security surface**: the `server_config` resource exposes only redacted
  metadata and a test asserts no `dbUser`/`dbPassword`; `MCP_BASE_URL` rejects
  embedded credentials/query/hash.
- **E2E report** distinguishes 22 unique tools from 23 invocations
  (`scripts/e2e-mcp-tools.mjs:156-157`).

## Findings

### High — merge blocker

#### 1. `SERVER_NAME` is newly required; 1.5.x defaulted it to `localhost`

`src/config.ts:166`, `src/config.ts:71-77`

On main, `db.ts` used `process.env.SERVER_NAME || "localhost"`, so a working
deployment against a local SQL Server could legitimately omit it. After
auto-update, that deployment now dies at startup with
`SERVER_NAME is required and must not be blank.` — precisely the undeclared
breaking migration the product decision forbids, and the changelog does not
mention it.

**Recommendation:** default omitted `SERVER_NAME` to `localhost` (optionally
keep rejecting explicit blank), or declare the break and bump major.

`DB_USER`/`DB_PASSWORD` requiredness is different in kind: 1.5.x configs
omitting them could never connect (every query failed), so failing fast at
startup changes the failure mode of an already-broken config rather than
breaking a working one — acceptable, but worth one changelog line.

### Medium

#### 2. Empty-string values now abort startup where 1.5.x fell back to defaults

`src/config.ts:79-99`, `src/config.ts:38-69`, `src/config.ts:241-251`

Verified against the built code: `READONLY=`, `ENCRYPT=`, `MCP_TRANSPORT=`,
`CONNECTION_TIMEOUT=`, `MAX_ROWS=`, `MCP_HTTP_PORT=` (blank, not just
malformed) all throw. 1.5.x treated blank as unset
(`if (!value) return fallback`), and blank values are common from
docker-compose/CI interpolation like `READONLY=${READONLY}` with the variable
unset. The test suite explicitly encodes `ENCRYPT: ""` → throw, so this is
currently by design — but it sits in the gray zone between "omitted" and
"explicitly malformed," and it can break a previously working 1.5.x
deployment.

**Recommendation:** treat blank-after-trim as omitted (use the default) and
keep rejecting non-blank garbage. Note `MCP_BASE_URL` and `MCP_HTTP_HOST`
already treat blank as unset, so the current handling is also internally
inconsistent.

#### 3. Stdio deployments now validate HTTP-only settings that 1.5.x ignored

`src/config.ts:224-238`

`parseEnvironmentConfig` always parses `MCP_HTTP_PORT` and `MCP_BASE_URL`,
even when `mcpTransport` is `stdio`. On main, `MCP_BASE_URL` had no production
caller at all, and a bad `MCP_HTTP_PORT` silently fell back — verified that a
stdio config with leftover `MCP_HTTP_PORT=abc` or
`MCP_BASE_URL=https://x.test/?a=1` now fails startup. A leftover junk value in
a variable the running transport never uses should not be fatal.

**Recommendation:** scope the strict parse to `mcpTransport === "http"`, or
accept and declare this in the changelog.

#### 4. Quick-start presets ship `sa`/`Str0ng!Passw0rd` with `ENABLE_DDL: "true"`, and the changelog misdescribes them

`src/samples/claude_desktop_config.json`, `src/samples/vscode_agent_config.json`,
README.md:63-70, README.md:91-98, README.md:9 (install badge), CHANGELOG.md:22

The copyable samples, README quick-start blocks, and the one-click VS Code
install badge all switched from `your_username`/`your_password` +
`ENABLE_DDL=false` on main to the dev-stack `sa` password with DDL enabled.
README.md:79 does tell users to turn DDL off, but this contradicts SECURITY.md
and README.md:315 ("Keep `ENABLE_DDL=false` unless…"), and copy-paste defaults
are what people actually run. Separately, CHANGELOG.md:22 claims samples "now
contain only required variables" — they contain three optional ones
(`TRUST_SERVER_CERTIFICATE`, `READONLY`, `ENABLE_DDL`), so the statement is
false either way.

**Recommendation:** placeholders + `ENABLE_DDL=false` in the presets (keep the
dev creds in `.env.example`, which is explicitly the Docker dev file), and fix
the changelog line.

### Low — optional cleanup, not merge blockers

#### 5. Database allowlist and tool limits still reparse `process.env` per request

`getDefaultDatabaseName`/`getAllowedDatabases` (`src/db.ts:22-49`) duplicate
the resolution logic in `parseEnvironmentConfig` and re-read env on every
call, and tools re-read `MAX_ROWS`/`MAX_WRITE_ROWS` per request via
`getMaxRows`/`getMaxWriteRows`/`clampRowLimit` (e.g.
`src/tools/ReadDataTool.ts:26`, `src/tools/UpdateDataTool.ts:49`). Behavior is
consistent today because startup validates the same values, but this is
exactly the brief's item 3, and the duplicated default-database logic can
drift.

#### 6. Seven config getters now have no production caller

`getMcpTransport`, `getMcpHttpPort`, `getMcpHttpHost`, `getMcpBaseUrl`,
`getQueryTimeoutMs`, `isDdlEnabled`, `isWritePreviewRequired`
(`src/config.ts:258-334`) are referenced only by tests since
`index.ts`/`db.ts` moved to the environment snapshot. Per the "dead getters
stay removed" decision, these should go too (and their removal would also
shrink finding 5).

#### 7. Doc nits

- `.env.example:4` labels `TRUST_SERVER_CERTIFICATE`, `READONLY`, `ENABLE_DDL`
  (all optional with defaults) under "Required MCP server configuration",
  disagreeing with the README's correct required table.
- README.md:306 says "set required `ENABLE_DDL`" — leftover wording from when
  it was required.

#### 8. Line-ending churn (cosmetic)

`src/schema.ts` was normalized from mixed (536/590 CRLF) to fully CRLF, which
is why the one-character `[rowCount]` fix appears as a ~120-line block
rewrite; `src/__tests__/db.test.ts` has similar identical-line churn. More
notably, `src/config.ts` went the other direction: it was 100% CRLF on main
and is now mixed (302/337), because the new lines were added as LF.
`git diff --check` passes and the `.gitattributes` rules still catch genuine
trailing whitespace (only `cr-at-eol` is exempted), so this is cosmetic — but
normalizing `config.ts` to one ending would avoid future churn.

## Bottom line

Finding 1 (`SERVER_NAME` requiredness) is the one true blocker under the
stated product decision — it is a one-line fix to restore the `localhost`
default. Findings 2–4 need a product call each (blank-means-omitted,
transport-scoped validation, preset credentials/DDL) but have small fixes if
accepted. Everything else — database fallback, boolean defaults, TLS
honoring, port handling, startup snapshot, versioning, redaction, the
rowCount fix, and test coverage — is correct and well-tested as implemented.
