import { EventEmitter } from "node:events";
import type sql from "mssql";
import { describe, expect, it, vi } from "vitest";
import { streamRows } from "../tools/ReadDataTool.js";

class FakeRequest extends EventEmitter {
  stream = false;
  cancel = vi.fn();
  query = vi.fn();
}

function asRequest(fake: FakeRequest) {
  return fake as unknown as sql.Request;
}

describe("streamRows", () => {
  it("collects rows up to the limit, cancels, and reports truncation", async () => {
    const fake = new FakeRequest();
    const pending = streamRows(asRequest(fake), "SELECT 1", 2);

    expect(fake.stream).toBe(true);
    fake.emit("row", { id: 1 });
    fake.emit("row", { id: 2 });
    fake.emit("row", { id: 3 });
    fake.emit("row", { id: 4 });
    fake.emit(
      "error",
      Object.assign(new Error("canceled"), { code: "ECANCEL" })
    );
    fake.emit("done");

    await expect(pending).resolves.toEqual({
      rows: [{ id: 1 }, { id: 2 }],
      truncated: true,
    });
    expect(fake.cancel).toHaveBeenCalledTimes(1);
  });

  it("does not settle on error until the request is done", async () => {
    const fake = new FakeRequest();
    const pending = streamRows(asRequest(fake), "SELECT bad", 10);
    let settled = false;
    pending.catch(() => undefined).finally(() => (settled = true));

    fake.emit("error", new Error("Invalid column name 'bad'."));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    fake.emit("done");
    await expect(pending).rejects.toThrow("Invalid column name");
  });

  it("resolves with all rows when under the limit", async () => {
    const fake = new FakeRequest();
    const pending = streamRows(asRequest(fake), "SELECT 1", 5);
    fake.emit("row", { id: 1 });
    fake.emit("done");

    await expect(pending).resolves.toEqual({
      rows: [{ id: 1 }],
      truncated: false,
    });
    expect(fake.cancel).not.toHaveBeenCalled();
  });
});

describe("describeSqlError", () => {
  it("reports client cancellation without driver details", async () => {
    const sql = (await import("mssql")).default;
    const { describeSqlError, isCancellation } =
      await import("../sqlErrors.js");
    const canceled = new sql.RequestError("Canceled.", "ECANCEL");
    const aborted = new DOMException(
      "This operation was aborted",
      "AbortError"
    );

    expect(isCancellation(canceled)).toBe(true);
    expect(isCancellation(aborted)).toBe(true);
    expect(describeSqlError(aborted)).toBe("The query was canceled.");
    expect(
      isCancellation(
        new sql.RequestError("Invalid column name 'x'.", "EREQUEST")
      )
    ).toBe(false);
  });
});
