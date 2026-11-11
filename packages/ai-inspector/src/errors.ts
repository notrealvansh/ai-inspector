import type { SerializedError, Usage } from "./types.js";

export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || "Unknown error",
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  if (error && typeof error === "object") {
    const candidate = error as {
      name?: unknown;
      message?: unknown;
      stack?: unknown;
    };
    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : safeStringify(error);
    return {
      name: typeof candidate.name === "string" ? candidate.name : "Error",
      message: message || "Unknown error",
      ...(typeof candidate.stack === "string" ? { stack: candidate.stack } : {}),
    };
  }

  return { name: "Error", message: String(error) };
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Keeps reported token counts as reported. Invalid values are dropped. */
export function normalizeUsage(usage: Usage | undefined | null): Usage | undefined {
  if (!usage) return undefined;

  const normalized: Usage = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "totalTokens",
    "cachedInputTokens",
    "reasoningTokens",
  ] as const) {
    const value = usage[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function mergeUsage(
  current: Usage | undefined,
  patch: Usage | undefined,
): Usage | undefined {
  if (!patch) return current;
  const normalized = normalizeUsage(patch);
  if (!normalized) return current;
  return { ...current, ...normalized };
}
