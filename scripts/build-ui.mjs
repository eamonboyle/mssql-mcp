import { build } from "vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { viteSingleFile } from "vite-plugin-singlefile";
import { renameSync, existsSync } from "fs";
import { rmSync, mkdirSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const uiDir = resolve(root, "dist", "ui");
const srcDir = resolve(uiDir, "src", "ui");

const config = (inputFile) => ({
  plugins: [viteSingleFile()],
  build: {
    outDir: uiDir,
    emptyOutDir: inputFile === "query-results",
    rollupOptions: {
      input: resolve(root, `src/ui/${inputFile}.html`),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});

await build(config("query-results"));
await build(config("table-explorer"));
await build(config("schema-viewer"));

const files = ["query-results.html", "table-explorer.html", "schema-viewer.html"];
for (const file of files) {
  const src = resolve(srcDir, file);
  const dest = resolve(uiDir, file);
  if (existsSync(src)) {
    renameSync(src, dest);
  }
}

if (existsSync(srcDir)) {
  rmSync(srcDir, { recursive: true });
}
