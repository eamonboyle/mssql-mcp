import { randomBytes } from "node:crypto";
import type { WriteDataToolName } from "./writePreviewGrant.js";

interface WritePreviewGrant {
  fingerprint: string;
  writeToolName: WriteDataToolName;
  expiresAt: number;
}

const WRITE_PREVIEW_GRANT_TTL_MS = 10 * 60 * 1000;

const grants = new Map<string, WritePreviewGrant>();

function purgeExpiredGrants(now: number) {
  for (const [token, grant] of grants) {
    if (grant.expiresAt < now) {
      grants.delete(token);
    }
  }
}

/**
 * Process-global store so preview tokens remain valid across HTTP round-trips
 * (each request uses a fresh ServerState for query plans / results).
 */
export const writePreviewGrantStore = {
  issue(fingerprint: string, writeToolName: WriteDataToolName): string {
    const now = Date.now();
    purgeExpiredGrants(now);
    const token = randomBytes(24).toString("base64url");
    grants.set(token, {
      fingerprint,
      writeToolName,
      expiresAt: now + WRITE_PREVIEW_GRANT_TTL_MS,
    });
    return token;
  },

  consume(
    token: string,
    fingerprint: string,
    writeToolName: WriteDataToolName
  ): boolean {
    const now = Date.now();
    purgeExpiredGrants(now);
    if (!token) {
      return false;
    }
    const grant = grants.get(token);
    if (!grant) {
      return false;
    }
    if (
      grant.expiresAt < now ||
      grant.fingerprint !== fingerprint ||
      grant.writeToolName !== writeToolName
    ) {
      grants.delete(token);
      return false;
    }
    grants.delete(token);
    return true;
  },
};
