// Imported first by index.ts so it runs before any dependency is evaluated.
// Logs to stderr only: stdout belongs to the stdio JSON-RPC stream.
import { nodeVersionError } from "./nodeVersion.js";

const versionError = nodeVersionError();
if (versionError) {
  console.error(versionError);
  process.exit(1);
}
