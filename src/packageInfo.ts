import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJsonFields {
  name?: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: { url?: string };
}

let cached: PackageJsonFields | undefined;

function getPackageJsonPath(): string {
  const dir = dirname(fileURLToPath(import.meta.url));
  return join(dir, "..", "package.json");
}

export function readPackageJson(): PackageJsonFields {
  if (cached) {
    return cached;
  }
  const raw = readFileSync(getPackageJsonPath(), "utf8");
  cached = JSON.parse(raw) as PackageJsonFields;
  return cached;
}

export function getPackageVersion(): string {
  const v = readPackageJson().version;
  if (typeof v !== "string" || v.length === 0) {
    throw new Error("package.json is missing a non-empty version");
  }
  return v;
}

export function getPackageName(): string {
  const n = readPackageJson().name;
  if (typeof n !== "string" || n.length === 0) {
    throw new Error("package.json is missing a non-empty name");
  }
  return n;
}
