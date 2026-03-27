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

    registerPrompts(server as never, { isReadOnly: false });

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

  it("review_write_operation tells the assistant not to bypass when read-only", () => {
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

    registerPrompts(server as never, { isReadOnly: true });

    const callback = callbacks.get("review_write_operation")!;
    const result = callback({
      operation: "DELETE FROM dbo.Users WHERE id = 1",
      databaseName: "AppDb",
    }) as { messages: { content: { text: string } }[] };

    const text = result.messages[0].content.text;
    expect(text).toContain("read-only");
    expect(text).toMatch(/sqlcmd|SSMS/i);
    expect(text).toMatch(/STOP|Do not execute/i);
  });
});
