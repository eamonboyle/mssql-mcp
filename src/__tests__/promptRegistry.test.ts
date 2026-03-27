import { describe, expect, it } from "vitest";
import { registerPrompts } from "../promptRegistry.js";

describe("promptRegistry", () => {
  it("registers prompt callbacks without a fallback branch", () => {
    const callbacks = new Map<string, (args: Record<string, string>) => unknown>();
    const server = {
      registerPrompt(
        name: string,
        _meta: unknown,
        callback: (args: Record<string, string>) => unknown
      ) {
        callbacks.set(name, callback);
      },
    };

    registerPrompts(server as never);

    const callback = callbacks.get("review_write_operation");
    expect(callback).toBeDefined();
    expect(
      callback?.({
        operation: "delete inactive users",
        databaseName: "AppDb",
      })
    ).toMatchObject({
      description:
        "Review a proposed change and identify safety checks before running it.",
    });
  });
});
