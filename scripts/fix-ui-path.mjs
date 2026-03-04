import { renameSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const uiDir = join(root, "dist", "ui");
const srcDir = join(uiDir, "src", "ui");

const files = ["query-results.html", "table-explorer.html"];
for (const file of files) {
  const src = join(srcDir, file);
  const dest = join(uiDir, file);
  if (existsSync(src)) {
    renameSync(src, dest);
  }
}
