import type { Cost, Usage } from "./types.js";

export interface ModelPricing {
  /** Informational. Lookup is by model id. */
  provider?: string;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedInputPerMillion?: number;
}

export type PricingTable = Record<string, ModelPricing>;

export interface PricingMatch {
  pricing: ModelPricing;
  source: "builtin" | "custom";
}

/**
 * A small convenience table in USD per million tokens. Provider pricing changes
 * often, so treat these values as estimates and override them with the
 * `pricing` option when accuracy matters.
 */
export const builtInPricing: PricingTable = {
  "gpt-4o": { provider: "openai", inputPerMillion: 2.5, outputPerMillion: 10, cachedInputPerMillion: 1.25 },
  "gpt-4o-mini": { provider: "openai", inputPerMillion: 0.15, outputPerMillion: 0.6, cachedInputPerMillion: 0.075 },
  "gpt-4.1": { provider: "openai", inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5 },
  "gpt-4.1-mini": { provider: "openai", inputPerMillion: 0.4, outputPerMillion: 1.6, cachedInputPerMillion: 0.1 },
  "gpt-4.1-nano": { provider: "openai", inputPerMillion: 0.1, outputPerMillion: 0.4, cachedInputPerMillion: 0.025 },
  "gpt-5": { provider: "openai", inputPerMillion: 1.25, outputPerMillion: 10, cachedInputPerMillion: 0.125 },
  "gpt-5-mini": { provider: "openai", inputPerMillion: 0.25, outputPerMillion: 2, cachedInputPerMillion: 0.025 },
  "gpt-5-nano": { provider: "openai", inputPerMillion: 0.05, outputPerMillion: 0.4, cachedInputPerMillion: 0.005 },
  o3: { provider: "openai", inputPerMillion: 2, outputPerMillion: 8, cachedInputPerMillion: 0.5 },
  "o3-mini": { provider: "openai", inputPerMillion: 1.1, outputPerMillion: 4.4, cachedInputPerMillion: 0.55 },
  "o4-mini": { provider: "openai", inputPerMillion: 1.1, outputPerMillion: 4.4, cachedInputPerMillion: 0.275 },
  "text-embedding-3-small": { provider: "openai", inputPerMillion: 0.02, outputPerMillion: 0 },
  "text-embedding-3-large": { provider: "openai", inputPerMillion: 0.13, outputPerMillion: 0 },

  "claude-sonnet-4-5": { provider: "anthropic", inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  "claude-sonnet-4": { provider: "anthropic", inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },
  "claude-opus-4-1": { provider: "anthropic", inputPerMillion: 15, outputPerMillion: 75, cachedInputPerMillion: 1.5 },
  "claude-opus-4": { provider: "anthropic", inputPerMillion: 15, outputPerMillion: 75, cachedInputPerMillion: 1.5 },
  "claude-haiku-4-5": { provider: "anthropic", inputPerMillion: 1, outputPerMillion: 5, cachedInputPerMillion: 0.1 },
  "claude-3-5-haiku": { provider: "anthropic", inputPerMillion: 0.8, outputPerMillion: 4, cachedInputPerMillion: 0.08 },
  "claude-3-5-sonnet": { provider: "anthropic", inputPerMillion: 3, outputPerMillion: 15, cachedInputPerMillion: 0.3 },

  "gemini-2.5-pro": { provider: "google", inputPerMillion: 1.25, outputPerMillion: 10 },
  "gemini-2.5-flash": { provider: "google", inputPerMillion: 0.3, outputPerMillion: 2.5 },
  "gemini-2.0-flash": { provider: "google", inputPerMillion: 0.1, outputPerMillion: 0.4 },

  "mistral-large-latest": { provider: "mistral", inputPerMillion: 2, outputPerMillion: 6 },
  "mistral-small-latest": { provider: "mistral", inputPerMillion: 0.1, outputPerMillion: 0.3 },
};

const DATE_SUFFIX = /-(?:\d{4}-\d{2}-\d{2}|\d{8})$/;

function candidates(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return [];

  const withoutAlias = normalized.replace(/:[a-z0-9_-]+$/i, "");
  const withoutNamespace = withoutAlias.includes("/")
    ? withoutAlias.slice(withoutAlias.indexOf("/") + 1)
    : withoutAlias;

  const output = new Set<string>([normalized, withoutAlias, withoutNamespace]);
  for (const candidate of [withoutAlias, withoutNamespace]) {
    const withoutDate = candidate.replace(DATE_SUFFIX, "");
    output.add(withoutDate);
    output.add(withoutDate.replace(/\./g, "-"));
    output.add(withoutDate.replace(/-/g, "."));
  }
  return [...output].filter(Boolean);
}

export function findPricing(
  model: string | undefined,
  custom?: PricingTable,
): PricingMatch | undefined {
  if (!model) return undefined;

  const keys = candidates(model);
  if (custom) {
    for (const key of keys) {
      const entry = custom[key];
      if (entry) return { pricing: entry, source: "custom" };
    }
  }
  for (const key of keys) {
    const entry = builtInPricing[key];
    if (entry) return { pricing: entry, source: "builtin" };
  }
  return undefined;
}

/**
 * Requires both input and output token counts. A partial cost would look
 * authoritative while silently under-reporting the real bill.
 */
export function estimateCost(usage: Usage | undefined, match: PricingMatch): Cost | undefined {
  if (!usage) return undefined;
  const { inputTokens, outputTokens, cachedInputTokens } = usage;
  if (inputTokens === undefined || outputTokens === undefined) return undefined;
  if (cachedInputTokens !== undefined && cachedInputTokens > inputTokens) return undefined;

  const inputUsd =
    cachedInputTokens !== undefined && match.pricing.cachedInputPerMillion !== undefined
      ? ((inputTokens - cachedInputTokens) * match.pricing.inputPerMillion +
          cachedInputTokens * match.pricing.cachedInputPerMillion) /
        1_000_000
      : (inputTokens * match.pricing.inputPerMillion) / 1_000_000;

  const outputUsd = (outputTokens * match.pricing.outputPerMillion) / 1_000_000;

  return {
    inputUsd,
    outputUsd,
    totalUsd: inputUsd + outputUsd,
    currency: "USD",
    source: match.source,
  };
}
