import { createHash } from "node:crypto";

interface StoredQueryPlan {
  id: string;
  databaseName: string | null;
  query: string;
  planXml: string;
  createdAt: string;
}

interface StoredQueryResult {
  id: string;
  databaseName: string | null;
  label: string;
  payload: unknown;
  createdAt: string;
}

const DEFAULT_MAX_QUERY_PLANS = 100;
const DEFAULT_MAX_QUERY_RESULTS = 100;
const QUERY_ARTIFACT_TTL_MS = 60 * 60 * 1000;

function hashParts(parts: Array<string | null | undefined>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export class ServerState {
  private readonly queryPlans = new Map<string, StoredQueryPlan>();
  private readonly queryResults = new Map<string, StoredQueryResult>();

  private purgeExpiredQueryArtifacts(now: number) {
    for (const [id, plan] of this.queryPlans) {
      if (parseIsoMs(plan.createdAt) + QUERY_ARTIFACT_TTL_MS < now) {
        this.queryPlans.delete(id);
      }
    }
    for (const [id, result] of this.queryResults) {
      if (parseIsoMs(result.createdAt) + QUERY_ARTIFACT_TTL_MS < now) {
        this.queryResults.delete(id);
      }
    }
  }

  private evictOldestByCreatedAt<T extends { id: string; createdAt: string }>(
    map: Map<string, T>,
    maxEntries: number
  ) {
    if (map.size <= maxEntries) {
      return;
    }
    const sorted = [...map.values()].sort(
      (a, b) => parseIsoMs(a.createdAt) - parseIsoMs(b.createdAt)
    );
    while (map.size > maxEntries && sorted.length > 0) {
      const oldest = sorted.shift();
      if (oldest) {
        map.delete(oldest.id);
      }
    }
  }

  storeQueryPlan(databaseName: string | undefined, query: string, planXml: string) {
    const now = Date.now();
    this.purgeExpiredQueryArtifacts(now);
    const createdAt = new Date().toISOString();
    const id = hashParts([databaseName, query, planXml]);
    const entry: StoredQueryPlan = {
      id,
      databaseName: databaseName ?? null,
      query,
      planXml,
      createdAt,
    };
    this.queryPlans.set(id, entry);
    this.evictOldestByCreatedAt(this.queryPlans, DEFAULT_MAX_QUERY_PLANS);
    return entry;
  }

  getQueryPlan(id: string): StoredQueryPlan | undefined {
    this.purgeExpiredQueryArtifacts(Date.now());
    return this.queryPlans.get(id);
  }

  listQueryPlans(): StoredQueryPlan[] {
    this.purgeExpiredQueryArtifacts(Date.now());
    return [...this.queryPlans.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }

  storeQueryResult(
    databaseName: string | undefined,
    label: string,
    payload: unknown
  ) {
    const now = Date.now();
    this.purgeExpiredQueryArtifacts(now);
    const createdAt = new Date().toISOString();
    const id = hashParts([
      databaseName,
      label,
      JSON.stringify(payload, (_key, value) =>
        value instanceof Date ? value.toISOString() : value
      ),
    ]);
    const entry: StoredQueryResult = {
      id,
      databaseName: databaseName ?? null,
      label,
      payload,
      createdAt,
    };
    this.queryResults.set(id, entry);
    this.evictOldestByCreatedAt(this.queryResults, DEFAULT_MAX_QUERY_RESULTS);
    return entry;
  }

  getQueryResult(id: string): StoredQueryResult | undefined {
    this.purgeExpiredQueryArtifacts(Date.now());
    return this.queryResults.get(id);
  }

  listQueryResults(): StoredQueryResult[] {
    this.purgeExpiredQueryArtifacts(Date.now());
    return [...this.queryResults.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }
}
