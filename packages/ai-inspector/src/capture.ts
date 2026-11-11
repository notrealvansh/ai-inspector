import type { Attributes, AttributeValue } from "./types.js";

export type CaptureMode = "metadata" | "preview" | "full";

export interface CaptureOptions {
  /**
   * `preview` records truncated payloads with secrets redacted.
   * `metadata` drops inputs and outputs entirely and keeps timings, usage,
   * model names and other metadata. `full` records payloads without truncation.
   * Defaults to `preview`.
   */
  mode?: CaptureMode;
  /** Character limit for strings in `preview` mode. Defaults to 800. */
  maxStringLength?: number;
  /** Array item limit in all modes. Defaults to 25. */
  maxArrayLength?: number;
  /** Object nesting limit. Defaults to 6. */
  maxDepth?: number;
  /** Extra property names to redact, matched case-insensitively. */
  redactKeys?: string[];
  /** Return a replacement value. `undefined` removes the value. */
  redact?: (value: unknown, path: string) => unknown;
}

interface ResolvedCaptureOptions extends Required<Pick<CaptureOptions, "mode" | "maxStringLength" | "maxArrayLength" | "maxDepth">> {
  redactKeys: string[];
  redact?: CaptureOptions["redact"];
}

const DEFAULT_REDACTED_KEYS = [
  "authorization",
  "api_key",
  "api-key",
  "apikey",
  "token",
  "auth",
  "access_token",
  "access-token",
  "refresh_token",
  "refresh-token",
  "client_secret",
  "client-secret",
  "password",
  "secret",
  "cookie",
  "set-cookie",
  "x-api-key",
  "private_key",
  "private-key",
];

export type CaptureSanitizer = {
  readonly mode: CaptureMode;
  sanitize(value: unknown): unknown;
  sanitizeMetadata(value: unknown): unknown;
  sanitizeAttributes(attributes: Record<string, unknown>): Attributes;
};

export function createSanitizer(options: CaptureOptions = {}): CaptureSanitizer {
  const resolved: ResolvedCaptureOptions = {
    mode: options.mode ?? "preview",
    maxStringLength: options.maxStringLength ?? 800,
    maxArrayLength: options.maxArrayLength ?? 25,
    maxDepth: options.maxDepth ?? 6,
    redactKeys: options.redactKeys ?? [],
    ...(options.redact ? { redact: options.redact } : {}),
  };

  const redactedKeys = new Set(
    [...DEFAULT_REDACTED_KEYS, ...resolved.redactKeys].map((key) =>
      key.toLowerCase(),
    ),
  );

  function walk(value: unknown, path: string, depth: number, seen: WeakSet<object>): unknown {
    const result = baseWalk(value, path, depth, seen);
    if (resolved.redact) {
      try {
        return resolved.redact(result, path || "root");
      } catch {
        return "[Redaction failed]";
      }
    }
    return result;
  }

  function baseWalk(value: unknown, path: string, depth: number, seen: WeakSet<object>): unknown {
    if (depth > resolved.maxDepth) return "[Max depth]";

    if (value === null || value === undefined) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (resolved.mode === "preview" && value.length > resolved.maxStringLength) {
        return `${value.slice(0, resolved.maxStringLength)}…`;
      }
      return value;
    }
    if (typeof value === "bigint") return `${value.toString()}n`;
    if (typeof value === "function") return `[Function${value.name ? `: ${value.name}` : ""}]`;
    if (typeof value === "symbol") return String(value);

    if (value instanceof Date) return value.toISOString();
    if (value instanceof RegExp) return value.toString();
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }

    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);

      try {
        if (Array.isArray(value)) {
          const items = value
            .slice(0, resolved.maxArrayLength)
            .map((item, index) => walk(item, `${path}[${index}]`, depth + 1, seen));
          if (value.length > resolved.maxArrayLength) {
            items.push(`[${value.length - resolved.maxArrayLength} more items]`);
          }
          return items;
        }

        if (value instanceof Map) {
          return Array.from(value.entries())
            .slice(0, resolved.maxArrayLength)
            .map(([key, entry]) => [
              walk(key, `${path}.key`, depth + 1, seen),
              walk(entry, `${path}.value`, depth + 1, seen),
            ]);
        }

        if (value instanceof Set) {
          return Array.from(value.values())
            .slice(0, resolved.maxArrayLength)
            .map((entry, index) => walk(entry, `${path}[${index}]`, depth + 1, seen));
        }

        const output: Record<string, unknown> = {};
        for (const key of Object.keys(value)) {
          if (redactedKeys.has(key.toLowerCase())) {
            output[key] = "[REDACTED]";
            continue;
          }
          let property: unknown;
          try {
            property = (value as Record<string, unknown>)[key];
          } catch {
            output[key] = "[Unreadable]";
            continue;
          }
          output[key] = walk(property, path ? `${path}.${key}` : key, depth + 1, seen);
        }
        return output;
      } finally {
        seen.delete(value);
      }
    }

    return String(value);
  }

  function apply(value: unknown, path: string): unknown {
    return walk(value, path, 0, new WeakSet());
  }

  return {
    mode: resolved.mode,
    sanitize(value) {
      if (resolved.mode === "metadata") return undefined;
      return apply(value, "");
    },
    sanitizeMetadata(value) {
      return apply(value, "");
    },
    sanitizeAttributes(attributes) {
      const output: Attributes = {};
      for (const [key, value] of Object.entries(attributes)) {
        const attribute = toAttributeValue(value);
        if (attribute !== undefined) output[key] = attribute;
      }
      return output;
    },
  };
}

export function toAttributeValue(value: unknown): AttributeValue | undefined {
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
