function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.charCodeAt(0);
    if (codePoint < 32 || codePoint === 127) {
      return true;
    }
  }

  return false;
}

export function isSafeSqlIdentifier(value: string): boolean {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !containsControlCharacters(value)
  );
}

export function assertSafeSqlIdentifier(
  value: string,
  label = "identifier"
): void {
  if (!isSafeSqlIdentifier(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function quoteIdentifier(value: string): string {
  assertSafeSqlIdentifier(value);
  return `[${value.replace(/\]/g, "]]")}]`;
}

export function buildQualifiedName(
  objectName: string,
  schemaName?: string
): string {
  assertSafeSqlIdentifier(objectName, "object name");
  if (!schemaName) {
    return quoteIdentifier(objectName);
  }

  assertSafeSqlIdentifier(schemaName, "schema name");
  return `${quoteIdentifier(schemaName)}.${quoteIdentifier(objectName)}`;
}

export function getFriendlyObjectType(typeCode: string): string {
  switch (typeCode) {
    case "U":
      return "table";
    case "V":
      return "view";
    case "P":
      return "procedure";
    case "FN":
    case "IF":
    case "TF":
    case "FS":
    case "FT":
      return "function";
    case "TR":
      return "trigger";
    default:
      return "object";
  }
}

export function getObjectTypeCodes(objectTypes?: string[]): string[] {
  if (!objectTypes || objectTypes.length === 0) {
    return ["U", "V", "P", "FN", "IF", "TF", "FS", "FT", "TR"];
  }

  const typeMap: Record<string, string[]> = {
    table: ["U"],
    view: ["V"],
    procedure: ["P"],
    function: ["FN", "IF", "TF", "FS", "FT"],
    trigger: ["TR"],
  };

  const resolvedCodes = objectTypes.flatMap((objectType) => {
    const normalized = objectType.trim().toLowerCase();
    const codes = typeMap[normalized];
    if (!codes) {
      throw new Error(
        `Unsupported object type '${objectType}'. Expected one of: ${Object.keys(typeMap).join(", ")}.`
      );
    }

    return codes;
  });

  return [...new Set(resolvedCodes)];
}
