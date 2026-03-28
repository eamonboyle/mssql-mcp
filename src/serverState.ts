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

function hashParts(parts: Array<string | null | undefined>): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part ?? "");
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

export class ServerState {
  private readonly queryPlans = new Map<string, StoredQueryPlan>();
  private readonly queryResults = new Map<string, StoredQueryResult>();

  storeQueryPlan(databaseName: string | undefined, query: string, planXml: string) {
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
    return entry;
  }

  getQueryPlan(id: string): StoredQueryPlan | undefined {
    return this.queryPlans.get(id);
  }

  listQueryPlans(): StoredQueryPlan[] {
    return [...this.queryPlans.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }

  storeQueryResult(
    databaseName: string | undefined,
    label: string,
    payload: unknown
  ) {
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
    return entry;
  }

  getQueryResult(id: string): StoredQueryResult | undefined {
    return this.queryResults.get(id);
  }

  listQueryResults(): StoredQueryResult[] {
    return [...this.queryResults.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1
    );
  }
}
