import { describe, expect, it, vi } from "vitest";
import { ServerState } from "../serverState.js";

describe("ServerState", () => {
  it("evicts oldest query plans when over cap", () => {
    vi.useFakeTimers();
    const state = new ServerState();
    const t0 = new Date("2020-01-01T00:00:00.000Z").getTime();
    vi.setSystemTime(t0);
    for (let i = 0; i < 105; i++) {
      vi.setSystemTime(t0 + i * 1000);
      state.storeQueryPlan("db", `q${i}`, `<plan>${i}</plan>`);
    }
    expect(state.listQueryPlans().length).toBeLessThanOrEqual(100);
    vi.useRealTimers();
  });
});
