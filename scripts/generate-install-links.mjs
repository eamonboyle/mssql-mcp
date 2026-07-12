#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";

const README_PATH = new URL("../README.md", import.meta.url);
const SAMPLE_PATH = new URL(
  "../src/samples/claude_desktop_config.json",
  import.meta.url
);
const VSCODE_SAMPLE_PATH = new URL(
  "../src/samples/vscode_agent_config.json",
  import.meta.url
);

const sample = JSON.parse(await readFile(SAMPLE_PATH, "utf8"));
const server = sample.mcpServers["mssql-local"];
const vscodeSample = JSON.parse(await readFile(VSCODE_SAMPLE_PATH, "utf8"));
const vscodeServer = vscodeSample.servers["mssql-local"];
const comparableVscodeServer = {
  command: vscodeServer.command,
  args: vscodeServer.args,
  env: vscodeServer.env,
};
const cursorPayload = {
  command: server.command,
  args: server.args,
  env: server.env,
};
if (JSON.stringify(comparableVscodeServer) !== JSON.stringify(cursorPayload)) {
  throw new Error(
    "Claude Desktop and VS Code sample MCP configurations do not match."
  );
}
const vscodePayload = {
  name: "mssql-local",
  ...cursorPayload,
};

const cursorConfig = Buffer.from(JSON.stringify(cursorPayload)).toString(
  "base64"
);
const vscodeInstallUri = `vscode:mcp/install?${encodeURIComponent(
  JSON.stringify(vscodePayload)
)}`;
const vscodeRedirect = `https://intradeus.github.io/http-protocol-redirector?r=${encodeURIComponent(
  vscodeInstallUri
)}`;

const cursorBadge = `[![Add to Cursor](https://img.shields.io/badge/Add_to-Cursor-000000?style=for-the-badge&logo=cursor&logoColor=white)](https://cursor.com/en/install-mcp?name=mssql-local&config=${cursorConfig})`;
const vscodeBadge = `[![Install in VS Code](https://img.shields.io/badge/Install_in-VS_Code-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white)](${vscodeRedirect})`;
const expectedBlock = `${cursorBadge}\n${vscodeBadge}`;

const readme = await readFile(README_PATH, "utf8");
const badgePattern = /^\[!\[Add to Cursor\].*\n\[!\[Install in VS Code\].*$/m;
const currentBlock = readme.match(badgePattern)?.[0];

if (process.argv.includes("--check")) {
  if (currentBlock !== expectedBlock) {
    console.error(
      "README install links are stale. Run: npm run docs:update-install-links"
    );
    process.exit(1);
  }
  console.log("README install links match the sample MCP configuration.");
  process.exit(0);
}

if (!currentBlock) {
  throw new Error("Could not find the README install-link badge block.");
}

await writeFile(README_PATH, readme.replace(badgePattern, expectedBlock));
console.log("Updated README install links from the sample MCP configuration.");
