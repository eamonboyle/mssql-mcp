import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// vendor/sprintf-js replaces sprintf-js for tedious via package.json overrides
// (GHSA-hp3w-g68c-fv3c). Expected strings were captured from sprintf-js 1.1.3.
const require = createRequire(import.meta.url);
const { sprintf, vsprintf } = require("../../vendor/sprintf-js/index.js") as {
  sprintf: (format: string, ...args: unknown[]) => string;
  vsprintf: (format: string, args: unknown[]) => string;
};

describe("vendored sprintf-js", () => {
  it.each([
    [["Unrecognised data type 0x%02X", 7], "Unrecognised data type 0x07"],
    [
      ["Unrecognised type %s", "DateTimeOffsetN"],
      "Unrecognised type DateTimeOffsetN",
    ],
    [
      [
        "type:0x%02X(%s), status:0x%02X(%s), length:0x%04X, spid:0x%04X, packetId:0x%02X, window:0x%02X",
        18,
        "PRELOGIN",
        1,
        "EOM",
        47,
        0,
        1,
        0,
      ],
      "type:0x12(PRELOGIN), status:0x01(EOM), length:0x002F, spid:0x0000, packetId:0x01, window:0x00",
    ],
    [
      [
        "TDS:0x%08X, PacketSize:0x%08X, ClientPID:0x%08X",
        1946157060,
        4096,
        41234,
      ],
      "TDS:0x74000004, PacketSize:0x00001000, ClientPID:0x0000A112",
    ],
    [["ClientTimezone:%d", -60], "ClientTimezone:-60"],
    [
      ["SSPI:'%s', AttachDbFile:'%s'", null, undefined],
      "SSPI:'null', AttachDbFile:'undefined'",
    ],
    [["%02X", 300], "12C"],
    [["neg %02X %d", -1, 2.7], "neg FFFFFFFF 2"],
    [["100%% done %d", 5], "100% done 5"],
  ])("matches sprintf-js for %j", (call, expected) => {
    const [format, ...args] = call as [string, ...unknown[]];
    expect(sprintf(format, ...args)).toBe(expected);
  });

  it("supports vsprintf", () => {
    expect(vsprintf("%s-%04X", ["id", 255])).toBe("id-00FF");
  });

  it.each(["%.99999f", "%j", "%(name)s", "%5.2d"])(
    "rejects unsupported specifier %s",
    (format) => {
      expect(() => sprintf(format, 1)).toThrow(/unsupported format string/);
    }
  );

  it("rejects non-numeric values for numeric specifiers", () => {
    expect(() => sprintf("%d", "abc")).toThrow(TypeError);
  });
});
