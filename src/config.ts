const DEFAULT_MAX_ROWS = 10000;
const DEFAULT_QUERY_TIMEOUT_MS = 30000;
const DEFAULT_SEARCH_LIMIT = 100;

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  minimum = 1
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
}

export function getMaxRows(): number {
  return parsePositiveInt(process.env.MAX_ROWS, DEFAULT_MAX_ROWS);
}

export function getQueryTimeoutMs(): number {
  return parsePositiveInt(
    process.env.QUERY_TIMEOUT_MS,
    DEFAULT_QUERY_TIMEOUT_MS
  );
}

export function getDefaultSearchLimit(): number {
  return Math.min(getMaxRows(), DEFAULT_SEARCH_LIMIT);
}

export function clampRowLimit(limit: unknown, fallback = getMaxRows()): number {
  const parsed =
    typeof limit === "number"
      ? limit
      : typeof limit === "string"
        ? Number.parseInt(limit, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed) || parsed < 1) {
    return Math.min(fallback, getMaxRows());
  }

  return Math.min(Math.floor(parsed), getMaxRows());
}
