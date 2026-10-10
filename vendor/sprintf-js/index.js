"use strict";

/**
 * Minimal replacement for sprintf-js, used only through the `overrides` entry
 * in the root package.json.
 *
 * sprintf-js <= 1.1.3 is affected by GHSA-hp3w-g68c-fv3c and has no patched
 * release. tedious (via mssql) only calls `sprintf` with hard-coded format
 * strings for debug output and error messages, using %s, %d and %X with an
 * optional zero-padded width. This module implements exactly that subset and
 * throws on anything else, so an unexpected caller fails loudly instead of
 * formatting silently wrong. Remove it once tedious stops depending on
 * sprintf-js (tediousjs/tedious#1814).
 */

const PLACEHOLDER = /%(%|(0)?(\d+)?([sdX]))/g;

function toInteger(value, specifier) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new TypeError(
      `[sprintf] expecting number but found ${typeof value} for %${specifier}`
    );
  }
  return parsed;
}

function sprintf(format, ...args) {
  if (typeof format !== "string") {
    throw new TypeError("[sprintf] format must be a string");
  }

  // Anything left after removing supported placeholders is a specifier this
  // subset does not implement (precision, %f, %j, named arguments, ...).
  if (format.replace(PLACEHOLDER, "").includes("%")) {
    throw new SyntaxError(`[sprintf] unsupported format string: ${format}`);
  }

  let argIndex = 0;
  const formatted = format.replace(
    PLACEHOLDER,
    (match, body, zeroPad, width, specifier) => {
      if (body === "%") {
        return "%";
      }

      const value = args[argIndex++];
      let text;
      switch (specifier) {
        case "s":
          text = String(value);
          break;
        case "d":
          text = String(toInteger(value, specifier));
          break;
        case "X":
          text = (toInteger(value, specifier) >>> 0).toString(16).toUpperCase();
          break;
      }

      const minWidth = width ? Number(width) : 0;
      return text.padStart(minWidth, zeroPad ? "0" : " ");
    }
  );

  return formatted;
}

function vsprintf(format, args) {
  return sprintf(format, ...(Array.isArray(args) ? args : []));
}

module.exports = { sprintf, vsprintf };
