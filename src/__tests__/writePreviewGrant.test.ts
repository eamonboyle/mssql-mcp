import { describe, expect, it } from "vitest";
import {
  fingerprintForUpdateOp,
  fingerprintForWriteTool,
} from "../writePreviewGrant.js";
import type { SqlFilter } from "../writeSafety.js";

describe("writePreviewGrant fingerprints", () => {
  it("matches for the same update operation regardless of filter and key order", () => {
    const filtersA: SqlFilter[] = [
      { column: "b", operator: "=", value: 1 },
      { column: "a", operator: ">", value: 0 },
    ];
    const filtersB: SqlFilter[] = [
      { column: "a", operator: ">", value: 0 },
      { column: "b", operator: "=", value: 1 },
    ];
    const fp1 = fingerprintForUpdateOp({
      tableName: "T",
      schemaName: "dbo",
      filters: filtersA,
      updates: { z: 1, a: 2 },
    });
    const fp2 = fingerprintForUpdateOp({
      tableName: "T",
      schemaName: "dbo",
      filters: filtersB,
      updates: { a: 2, z: 1 },
    });
    expect(fp1).toBe(fp2);
  });

  it("differs between update and delete for otherwise similar parameters", () => {
    const args: Record<string, unknown> = {
      tableName: "T",
      schemaName: "dbo",
      filters: [{ column: "id", operator: "=", value: 1 }],
      updates: { status: "x" },
    };
    const u = fingerprintForWriteTool("update_data", args);
    const d = fingerprintForWriteTool("delete_data", {
      tableName: "T",
      schemaName: "dbo",
      filters: [{ column: "id", operator: "=", value: 1 }],
    });
    expect(u).not.toBe(d);
  });

  it("differs when update payload changes", () => {
    const base = {
      tableName: "T",
      filters: [] as SqlFilter[],
      updates: { a: 1 },
    };
    expect(fingerprintForUpdateOp(base)).not.toBe(
      fingerprintForUpdateOp({ ...base, updates: { a: 2 } })
    );
  });

  it("matches delete fingerprint via preview_delete and delete_data tool names", () => {
    const args: Record<string, unknown> = {
      tableName: "Orders",
      schemaName: "sales",
      filters: [{ column: "id", operator: "=", value: 5 }],
    };
    expect(fingerprintForWriteTool("preview_delete", args)).toBe(
      fingerprintForWriteTool("delete_data", args)
    );
  });

  it("differs when schemaName is omitted vs dbo (fingerprint mismatch risk)", () => {
    const filters: SqlFilter[] = [{ column: "id", operator: "=", value: -1 }];
    const updates = { first_name: "Smoke" };
    const withoutSchema = fingerprintForUpdateOp({
      tableName: "Users",
      filters,
      updates,
    });
    const withDbo = fingerprintForUpdateOp({
      tableName: "Users",
      schemaName: "dbo",
      filters,
      updates,
    });
    expect(withoutSchema).not.toBe(withDbo);
  });

  it("differs when filters or updates change after preview", () => {
    const baseFilters: SqlFilter[] = [{ column: "id", operator: "=", value: -1 }];
    const a = fingerprintForUpdateOp({
      tableName: "Users",
      schemaName: "dbo",
      filters: baseFilters,
      updates: { first_name: "A" },
    });
    const b = fingerprintForUpdateOp({
      tableName: "Users",
      schemaName: "dbo",
      filters: baseFilters,
      updates: { first_name: "B" },
    });
    const c = fingerprintForUpdateOp({
      tableName: "Users",
      schemaName: "dbo",
      filters: [{ column: "id", operator: "=", value: 0 }],
      updates: { first_name: "A" },
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});
