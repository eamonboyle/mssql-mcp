import { describe, expect, it, vi } from "vitest";
import { writePreviewGrantStore } from "../writePreviewGrantStore.js";

describe("writePreviewGrantStore", () => {
  it("issues and consumes a grant once", () => {
    const fp = "fp1";
    const token = writePreviewGrantStore.issue(fp, "update_data");
    expect(writePreviewGrantStore.consume(token, fp, "update_data")).toBe(true);
    expect(writePreviewGrantStore.consume(token, fp, "update_data")).toBe(false);
  });

  it("rejects fingerprint or tool mismatch", () => {
    const token = writePreviewGrantStore.issue("a", "delete_data");
    expect(writePreviewGrantStore.consume(token, "b", "delete_data")).toBe(false);
    const token2 = writePreviewGrantStore.issue("a", "delete_data");
    expect(writePreviewGrantStore.consume(token2, "a", "update_data")).toBe(false);
  });

  it("rejects empty or unknown tokens", () => {
    const token = writePreviewGrantStore.issue("fp", "update_data");
    expect(writePreviewGrantStore.consume("", "fp", "update_data")).toBe(false);
    expect(writePreviewGrantStore.consume("not-a-real-token", "fp", "update_data")).toBe(false);
    expect(writePreviewGrantStore.consume(token, "fp", "update_data")).toBe(true);
  });

  it("rejects grants after WRITE_PREVIEW_GRANT_TTL_MS (10 minutes)", () => {
    vi.useFakeTimers();
    const token = writePreviewGrantStore.issue("fp", "update_data");
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(writePreviewGrantStore.consume(token, "fp", "update_data")).toBe(false);
    vi.useRealTimers();
  });
});
