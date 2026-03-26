import { afterEach, describe, expect, it } from "vitest";
import {
  clampRowLimit,
  getDefaultSearchLimit,
  getMaxRows,
  getQueryTimeoutMs,
} from "../config.js";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("config helpers", () => {
  it("uses defaults when env vars are absent", () => {
    delete process.env.MAX_ROWS;
    delete process.env.QUERY_TIMEOUT_MS;

    expect(getMaxRows()).toBe(10000);
    expect(getQueryTimeoutMs()).toBe(30000);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("reads env-based limits", () => {
    process.env.MAX_ROWS = "250";
    process.env.QUERY_TIMEOUT_MS = "45000";

    expect(getMaxRows()).toBe(250);
    expect(getQueryTimeoutMs()).toBe(45000);
    expect(getDefaultSearchLimit()).toBe(100);
  });

  it("clamps row limits to the configured maximum", () => {
    process.env.MAX_ROWS = "50";

    expect(clampRowLimit(200)).toBe(50);
    expect(clampRowLimit("5")).toBe(5);
    expect(clampRowLimit(undefined)).toBe(50);
  });
});
