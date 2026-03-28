#!/usr/bin/env node
/**
 * Build the MCP server, stage dist + production deps into claude-extension/, and run mcpb pack.
 * Staged artifacts are gitignored; commit only manifest.json and this repo's sources.
 */
import { execSync } from "node:child_process";
import { cp, readFile, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const extDir = path.join(root, "claude-extension");

async function ensureDist() {
  const dist = path.join(root, "dist");
  try {
    const s = await stat(dist);
    if (!s.isDirectory()) {
      throw new Error("dist is not a directory");
    }
  } catch {
    throw new Error("Missing dist/. Run npm run build first.");
  }
}

async function stage() {
  await ensureDist();

  await rm(path.join(extDir, "server"), { recursive: true, force: true });
  await rm(path.join(extDir, "node_modules"), { recursive: true, force: true });
  await rm(path.join(extDir, "package.json"), { force: true });
  await rm(path.join(extDir, "package-lock.json"), { force: true });

  await cp(path.join(root, "dist"), path.join(extDir, "server"), {
    recursive: true,
  });

  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const staging = {
    name: "mssql-mcp-mcpb-staging",
    private: true,
    type: "module",
    engines: pkg.engines,
    dependencies: pkg.dependencies,
  };
  await writeFile(
    path.join(extDir, "package.json"),
    `${JSON.stringify(staging, null, 2)}\n`
  );

  execSync("npm install --omit=dev --no-package-lock", {
    cwd: extDir,
    stdio: "inherit",
  });
}

async function main() {
  const skipBuild = process.argv.includes("--skip-build");
  if (!skipBuild) {
    execSync("npm run build", { cwd: root, stdio: "inherit" });
  }
  await stage();
  const manifest = JSON.parse(
    await readFile(path.join(extDir, "manifest.json"), "utf8")
  );
  const version = manifest.version ?? "0.0.0";
  const outName = `mssql-mcp-${version}.mcpb`;
  const outPath = path.join(extDir, outName);
  // Invoke via npx from repo root so `node_modules/.bin` resolves (direct `mcpb` is not on PATH for `node scripts/...`).
  execSync(`npx mcpb pack "${extDir}" "${outPath}"`, {
    cwd: root,
    stdio: "inherit",
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
