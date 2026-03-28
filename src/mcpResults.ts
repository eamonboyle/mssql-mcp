import type { CallToolResult, ContentBlock, ResourceLink } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const toolResultOutputSchema = {
  version: z.literal(1),
  success: z.boolean(),
  message: z.string(),
  data: z.unknown().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  warnings: z.array(z.string()).optional(),
  error: z
    .object({
      code: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
  pagination: z
    .object({
      returned: z.number().int().nonnegative(),
      total: z.number().int().nonnegative().optional(),
      nextCursor: z.string().optional(),
    })
    .optional(),
  truncated: z.boolean().optional(),
} satisfies z.ZodRawShape;

export interface StandardToolPayload extends Record<string, unknown> {
  version: 1;
  success: boolean;
  message: string;
  data?: unknown;
  meta?: Record<string, unknown>;
  warnings?: string[];
  error?: {
    code: string;
    details?: unknown;
  };
  pagination?: {
    returned: number;
    total?: number;
    nextCursor?: string;
  };
  truncated?: boolean;
}

export function classifyToolErrorCode(
  raw: Record<string, unknown>,
  message: string,
  fallback = "TOOL_EXECUTION_FAILED"
): string {
  const explicit = raw.error;
  if (
    typeof explicit === "object" &&
    explicit !== null &&
    "code" in explicit &&
    typeof (explicit as { code: unknown }).code === "string" &&
    String((explicit as { code: string }).code).trim()
  ) {
    return String((explicit as { code: string }).code).trim();
  }
  if (typeof explicit === "string" && explicit.trim()) {
    return explicit.trim();
  }

  if (/invalid or disallowed database|invalid database/i.test(message)) {
    return "INVALID_DATABASE";
  }

  if (/security validation failed/i.test(message)) {
    return "SECURITY_VALIDATION_FAILED";
  }

  if (/multiple objects named|disambiguate/i.test(message)) {
    return "AMBIGUOUS_TARGET";
  }

  if (/preview required|confirmation canceled\. call preview_/i.test(message)) {
    return "PREVIEW_REQUIRED";
  }

  if (/invalid or expired previewtoken|write preview token/i.test(message)) {
    return "PREVIEW_TOKEN_INVALID";
  }

  if (/confirmation canceled|interactive confirmation is unavailable/i.test(message)) {
    return "CONFIRMATION_REQUIRED";
  }

  if (/ddl .*disabled/i.test(message)) {
    return "DDL_DISABLED";
  }

  if (/exceeds max_write_rows/i.test(message)) {
    return "WRITE_LIMIT_EXCEEDED";
  }

  if (/timeout/i.test(message)) {
    return "QUERY_TIMEOUT";
  }

  return fallback;
}

function createTextSummary(payload: StandardToolPayload) {
  if (!payload.success && payload.error) {
    return `${payload.message} (${payload.error.code})`;
  }

  return payload.message;
}

const MAX_INLINE_JSON_CHARS = 120_000;
const MAX_INLINE_ARRAY_ITEMS = 500;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

function shouldInlineDataInText(data: unknown): boolean {
  if (data === null || data === undefined) {
    return false;
  }
  if (Array.isArray(data)) {
    return true;
  }
  return isPlainRecord(data);
}

export function buildInlineDataAttachment(data: unknown): string {
  if (!shouldInlineDataInText(data)) {
    return "";
  }

  let toSerialize: unknown = data;
  let note = "";

  if (Array.isArray(data)) {
    if (data.length > MAX_INLINE_ARRAY_ITEMS) {
      toSerialize = data.slice(0, MAX_INLINE_ARRAY_ITEMS);
      note = `\n… showing ${MAX_INLINE_ARRAY_ITEMS} of ${data.length} items (remainder omitted from this text preview).`;
    }
  }

  let json: string;
  try {
    json = JSON.stringify(toSerialize, null, 2);
  } catch {
    return "\n\n(unable to serialize data for inline preview).";
  }

  if (json.length > MAX_INLINE_JSON_CHARS) {
    return `\n\n(inline preview omitted: serialized size ${json.length} chars).`;
  }

  return `\n\n${json}${note}`;
}

export function createResourceLink(
  uri: string,
  name: string,
  title: string,
  description: string,
  mimeType = "application/json"
): ResourceLink {
  return {
    type: "resource_link",
    uri,
    name,
    title,
    description,
    mimeType,
  };
}

/**
 * JSON-serializable copy of the tool payload for MCP `structuredContent`.
 * Required when tools declare `outputSchema` — the SDK rejects missing structured output on success.
 */
export function toToolStructuredContent(
  payload: StandardToolPayload
): Record<string, unknown> {
  try {
    const json = JSON.stringify(payload, (_key, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
        return value.toString("base64");
      }
      return value;
    });
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    const fallback: Record<string, unknown> = {
      version: payload.version,
      success: payload.success,
      message: payload.message,
    };
    if (payload.error !== undefined) {
      fallback.error = payload.error;
    }
    return fallback;
  }
}

export function createToolResult(
  payload: StandardToolPayload,
  extraContent: ContentBlock[] = []
): CallToolResult {
  const summary = createTextSummary(payload);
  const dataAttachment =
    payload.success && payload.data !== undefined
      ? buildInlineDataAttachment(payload.data)
      : "";

  return {
    content: [
      {
        type: "text",
        text: summary + dataAttachment,
      },
      ...extraContent,
    ],
    isError: !payload.success,
    structuredContent: toToolStructuredContent(payload),
  };
}

export function normalizeToolResult(
  rawResult: unknown,
  fallbackMessage: string
): StandardToolPayload {
  if (typeof rawResult !== "object" || rawResult === null) {
    return {
      version: 1,
      success: true,
      message: fallbackMessage,
      data: rawResult,
    };
  }

  const raw = rawResult as Record<string, unknown>;
  const success = raw.success !== false;
  const message =
    typeof raw.message === "string" && raw.message.trim()
      ? raw.message
      : fallbackMessage;

  const knownKeys = new Set([
    "success",
    "message",
    "error",
    "data",
    "meta",
    "warnings",
    "pagination",
    "truncated",
  ]);
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!knownKeys.has(key)) {
      passthrough[key] = value;
    }
  }

  let meta =
    raw.meta && typeof raw.meta === "object" && !Array.isArray(raw.meta)
      ? ({ ...raw.meta } as Record<string, unknown>)
      : undefined;

  if (Object.keys(passthrough).length > 0) {
    if ("data" in raw) {
      meta ??= {};
      meta.raw = passthrough;
    }
  }

  const payload: StandardToolPayload = {
    version: 1,
    success,
    message,
  };

  if ("data" in raw) {
    payload.data = raw.data;
  } else if (Object.keys(passthrough).length > 0) {
    if (Object.keys(passthrough).length === 1) {
      payload.data = Object.values(passthrough)[0];
    } else {
      payload.data = passthrough;
    }
  }

  if (meta && Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  if (Array.isArray(raw.warnings)) {
    payload.warnings = raw.warnings.filter(
      (warning): warning is string => typeof warning === "string"
    );
  }

  if (typeof raw.truncated === "boolean") {
    payload.truncated = raw.truncated;
  }

  if (
    raw.pagination &&
    typeof raw.pagination === "object" &&
    !Array.isArray(raw.pagination)
  ) {
    payload.pagination = raw.pagination as StandardToolPayload["pagination"];
  }

  if (!success) {
    payload.error = {
      code: classifyToolErrorCode(raw, message),
      details: raw.error && typeof raw.error !== "string" ? raw.error : undefined,
    };
  }

  return payload;
}
