import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { resolve } from "path";

const inputFile = process.env.INPUT || "query-results";

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: "dist/ui",
    emptyOutDir: process.env.INPUT === undefined,
    rollupOptions: {
      input: resolve(__dirname, `src/ui/${inputFile}.html`),
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
