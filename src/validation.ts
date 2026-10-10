/**
 * SQL query validation for read-only operations.
 *
 * The query is tokenized following T-SQL lexing rules (string literals,
 * quoted identifiers, nested comments, numeric/hex/money literals, CR or LF
 * line endings) so checks compare whole tokens. This matters because SQL
 * Server splits `1COMMIT` into `1` and `COMMIT` and runs consecutive
 * statements without a separating semicolon; regex word boundaries miss both.
 *
 * Validation is one layer: read_data also runs every query inside a
 * transaction that is always rolled back, and a least-privilege login remains
 * the primary control.
 */

const MAX_QUERY_LENGTH = 10000;

/** Words that never appear in a single read-only SELECT. */
const DANGEROUS_KEYWORDS = new Set([
  "DELETE",
  "DROP",
  "UPDATE",
  "UPDATETEXT",
  "WRITETEXT",
  "INSERT",
  "ALTER",
  "CREATE",
  "TRUNCATE",
  "EXEC",
  "EXECUTE",
  "MERGE",
  "GRANT",
  "REVOKE",
  "DENY",
  "COMMIT",
  "ROLLBACK",
  "SAVE",
  "TRANSACTION",
  "TRAN",
  "BEGIN",
  "DECLARE",
  "SET",
  "SETUSER",
  "REVERT",
  "USE",
  "BACKUP",
  "RESTORE",
  "KILL",
  "SHUTDOWN",
  "CHECKPOINT",
  "RECONFIGURE",
  "DBCC",
  "WAITFOR",
  "RECEIVE",
  "SEND",
  "MOVE",
  "WHILE",
  "IF",
  "GOTO",
  "RAISERROR",
  "THROW",
  "PRINT",
  "OPENROWSET",
  "OPENDATASOURCE",
  "OPENQUERY",
  "OPENXML",
  "BULK",
  "INTO",
]);

/** Functions that disclose login or host identity. */
const IDENTITY_FUNCTIONS = new Set([
  "USER_NAME",
  "SUSER_NAME",
  "SUSER_SNAME",
  "HOST_NAME",
  "ORIGINAL_LOGIN",
]);

/** Words that may directly precede an additional top-level SELECT. */
const SET_OPERATORS = new Set(["UNION", "ALL", "EXCEPT", "INTERSECT"]);

type TokenType = "word" | "number" | "string" | "identifier" | "punct";

export interface SqlToken {
  type: TokenType;
  /** Uppercased text for words; raw text otherwise. */
  value: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const WORD_START = /[\p{L}_@#]/u;
const WORD_PART = /[\p{L}\p{N}_@#$]/u;
const DIGIT = /[0-9]/;
const HEX_DIGIT = /[0-9A-Fa-f]/;

function isLineBreak(char: string | undefined) {
  return char === "\n" || char === "\r";
}

/**
 * Splits a query into T-SQL tokens. Comments and whitespace are dropped.
 * Returns null when a string literal, quoted identifier, or block comment is
 * left unterminated.
 */
export function tokenizeSql(query: string): SqlToken[] | null {
  const tokens: SqlToken[] = [];
  let index = 0;

  const readNumber = () => {
    const start = index;
    if (query[index] === "0" && /[xX]/.test(query[index + 1] ?? "")) {
      index += 2;
      while (HEX_DIGIT.test(query[index] ?? "")) index += 1;
      return query.slice(start, index);
    }
    while (DIGIT.test(query[index] ?? "")) index += 1;
    if (query[index] === ".") {
      index += 1;
      while (DIGIT.test(query[index] ?? "")) index += 1;
    }
    if (
      /[eE]/.test(query[index] ?? "") &&
      (DIGIT.test(query[index + 1] ?? "") ||
        (/[+-]/.test(query[index + 1] ?? "") &&
          DIGIT.test(query[index + 2] ?? "")))
    ) {
      index += 2;
      while (DIGIT.test(query[index] ?? "")) index += 1;
    }
    return query.slice(start, index);
  };

  while (index < query.length) {
    const char = query[index];
    const next = query[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    // Line comments end at CR or LF: SQL Server treats a bare CR as a break.
    if (char === "-" && next === "-") {
      while (index < query.length && !isLineBreak(query[index])) index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      // T-SQL block comments nest.
      let depth = 1;
      index += 2;
      while (index < query.length && depth > 0) {
        if (query[index] === "/" && query[index + 1] === "*") {
          depth += 1;
          index += 2;
        } else if (query[index] === "*" && query[index + 1] === "/") {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      if (depth > 0) return null;
      continue;
    }

    if (char === "'" || char === '"' || char === "[") {
      const close = char === "[" ? "]" : char;
      const start = index;
      index += 1;
      let terminated = false;
      while (index < query.length) {
        if (query[index] === close) {
          // Doubled delimiters ('' or ]] or "") escape the delimiter.
          if (query[index + 1] === close) {
            index += 2;
            continue;
          }
          index += 1;
          terminated = true;
          break;
        }
        index += 1;
      }
      if (!terminated) return null;
      tokens.push({
        type: char === "'" ? "string" : "identifier",
        value: query.slice(start, index),
      });
      continue;
    }

    if (DIGIT.test(char) || (char === "." && DIGIT.test(next ?? ""))) {
      tokens.push({ type: "number", value: readNumber() });
      continue;
    }

    // Money literal such as $5 or $.5.
    if (
      char === "$" &&
      (DIGIT.test(next ?? "") ||
        (next === "." && DIGIT.test(query[index + 2] ?? "")))
    ) {
      index += 1;
      tokens.push({ type: "number", value: `$${readNumber()}` });
      continue;
    }

    if (
      WORD_START.test(char) ||
      (char === "$" && WORD_START.test(next ?? ""))
    ) {
      const start = index;
      index += 1;
      while (index < query.length && WORD_PART.test(query[index])) index += 1;
      tokens.push({
        type: "word",
        value: query.slice(start, index).toUpperCase(),
      });
      continue;
    }

    tokens.push({ type: "punct", value: char });
    index += 1;
  }

  return tokens;
}

function invalid(error: string): ValidationResult {
  return { isValid: false, error };
}

const MALICIOUS_PATTERN_ERROR =
  "Potentially malicious SQL pattern detected. Only simple SELECT queries are allowed.";

/**
 * Validates a SQL query for read-only use: exactly one SELECT statement,
 * optionally preceded by common table expressions and combined with
 * UNION/EXCEPT/INTERSECT.
 */
export function validateReadQuery(query: string): ValidationResult {
  if (!query || typeof query !== "string") {
    return invalid("Query must be a non-empty string");
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return invalid(
      "Query is too long. Maximum allowed length is 10,000 characters."
    );
  }

  const tokens = tokenizeSql(query);
  if (tokens === null) {
    return invalid(
      "Query contains an unterminated string literal, quoted identifier, or comment."
    );
  }

  // Leading and trailing semicolons are harmless (";WITH ..." style, "...;").
  let start = 0;
  let end = tokens.length;
  while (start < end && tokens[start].value === ";") start += 1;
  while (end > start && tokens[end - 1].value === ";") end -= 1;
  const body = tokens.slice(start, end);

  if (body.length === 0) {
    return invalid("Query cannot be empty after removing comments");
  }

  if (body[0].type !== "word" || !["SELECT", "WITH"].includes(body[0].value)) {
    return invalid("Query must start with SELECT (or WITH for a CTE)");
  }

  for (const [position, token] of body.entries()) {
    if (token.type !== "word") continue;
    if (DANGEROUS_KEYWORDS.has(token.value)) {
      return invalid(
        `Dangerous keyword '${token.value}' detected in query. Only SELECT operations are allowed.`
      );
    }
    const following = body[position + 1];
    if (
      token.value.startsWith("@@") ||
      token.value.startsWith("SP_") ||
      token.value.startsWith("XP_") ||
      token.value === "SYSTEM_USER" ||
      (IDENTITY_FUNCTIONS.has(token.value) && following?.value === "(") ||
      ((token.value === "ENABLE" || token.value === "DISABLE") &&
        following?.value === "TRIGGER") ||
      ((token.value === "END" || token.value === "GET") &&
        following?.value === "CONVERSATION")
    ) {
      return invalid(MALICIOUS_PATTERN_ERROR);
    }
  }

  if (body.some((token) => token.value === ";")) {
    return invalid(
      "Multiple SQL statements are not allowed. Use only a single SELECT statement."
    );
  }

  // SQL Server runs consecutive statements without a separating semicolon,
  // so count top-level SELECTs that are not arms of a set operation.
  let depth = 0;
  let statementSelects = 0;
  for (const [position, token] of body.entries()) {
    if (token.value === "(") depth += 1;
    else if (token.value === ")") depth -= 1;
    else if (token.type === "word" && token.value === "SELECT" && depth === 0) {
      const previous = body[position - 1];
      if (!previous || !SET_OPERATORS.has(previous.value)) {
        statementSelects += 1;
      }
    }
    if (depth < 0) {
      return invalid("Query has unbalanced parentheses.");
    }
  }

  if (statementSelects !== 1) {
    return invalid(
      "Multiple SQL statements are not allowed. Use only a single SELECT statement."
    );
  }

  return { isValid: true };
}
