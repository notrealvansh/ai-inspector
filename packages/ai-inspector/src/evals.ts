import type { EvaluationResult } from "./types.js";

export interface ScorerContext {
  input?: unknown;
  output: unknown;
  expected?: unknown;
  metadata?: Record<string, unknown>;
}

export type ScorerValue =
  | number
  | boolean
  | { score: number; reason?: string };

export interface Scorer {
  readonly name: string;
  score(context: ScorerContext): ScorerValue | Promise<ScorerValue>;
}

export interface RunScorersOptions extends ScorerContext {
  scorers: Scorer[];
  /** Minimum score for each scorer to pass. Defaults to 0.5. */
  threshold?: number;
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function normalizeScore(value: ScorerValue): { score: number; reason?: string } {
  if (typeof value === "boolean") return { score: value ? 1 : 0 };
  if (typeof value === "number") {
    return { score: Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0 };
  }
  if (value && typeof value === "object") {
    return {
      score: Number.isFinite(value.score) ? Math.min(1, Math.max(0, value.score)) : 0,
      ...(typeof value.reason === "string" ? { reason: value.reason } : {}),
    };
  }
  return { score: 0, reason: "Scorer returned an unsupported value." };
}

export async function runScorers(options: RunScorersOptions): Promise<EvaluationResult[]> {
  const threshold = options.threshold ?? 0.5;
  const context: ScorerContext = {
    ...(options.input !== undefined ? { input: options.input } : {}),
    output: options.output,
    ...(options.expected !== undefined ? { expected: options.expected } : {}),
    ...(options.metadata ? { metadata: options.metadata } : {}),
  };

  const results: EvaluationResult[] = [];
  for (const scorer of options.scorers) {
    try {
      const raw = await scorer.score(context);
      const normalized = normalizeScore(raw);
      results.push({
        scorer: scorer.name,
        score: normalized.score,
        passed: normalized.score >= threshold,
        ...(normalized.reason ? { reason: normalized.reason } : {}),
      });
    } catch (error) {
      results.push({
        scorer: scorer.name,
        score: 0,
        passed: false,
        reason: `Scorer threw: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return results;
}

export const scorers = {
  exactMatch(
    options: { caseSensitive?: boolean; trim?: boolean } = {},
  ): Scorer {
    return {
      name: "exact_match",
      score({ output, expected }) {
        if (expected === undefined) {
          return { score: 0, reason: "No expected value was provided." };
        }
        let left = text(output);
        let right = text(expected);
        if (options.trim !== false) {
          left = left.trim();
          right = right.trim();
        }
        if (!options.caseSensitive) {
          left = left.toLowerCase();
          right = right.toLowerCase();
        }
        return {
          score: left === right ? 1 : 0,
          reason: left === right ? "Output matched." : "Output did not match.",
        };
      },
    };
  },

  includes(
    needle: string,
    options: { caseSensitive?: boolean } = {},
  ): Scorer {
    return {
      name: "includes",
      score({ output }) {
        const haystack = text(output);
        const matched = options.caseSensitive
          ? haystack.includes(needle)
          : haystack.toLowerCase().includes(needle.toLowerCase());
        return {
          score: matched ? 1 : 0,
          reason: matched ? "Output contained the expected text." : "Output did not contain the expected text.",
        };
      },
    };
  },

  matches(pattern: RegExp | string): Scorer {
    return {
      name: "matches",
      score({ output }) {
        let expression: RegExp;
        if (typeof pattern === "string") {
          expression = new RegExp(pattern);
        } else {
          expression = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, ""));
        }
        return {
          score: expression.test(text(output)) ? 1 : 0,
          reason: "Pattern check completed.",
        };
      },
    };
  },

  isJson(): Scorer {
    return {
      name: "is_json",
      score({ output }) {
        if (output !== null && typeof output === "object") return { score: 1 };
        try {
          JSON.parse(text(output));
          return { score: 1 };
        } catch {
          return { score: 0, reason: "Output is not valid JSON." };
        }
      },
    };
  },

  maxLength(limit: number): Scorer {
    return {
      name: "max_length",
      score({ output }) {
        const length = text(output).length;
        return {
          score: length <= limit ? 1 : 0,
          reason: `Output length ${length} ${length <= limit ? "is within" : "exceeds"} ${limit}.`,
        };
      },
    };
  },

  oneOf(expectedValues: unknown[]): Scorer {
    const allowed = new Set(expectedValues.map(text));
    return {
      name: "one_of",
      score({ output }) {
        return {
          score: allowed.has(text(output)) ? 1 : 0,
          reason: "Checked against the allowed values.",
        };
      },
    };
  },

  custom(
    name: string,
    score: (context: ScorerContext) => ScorerValue | Promise<ScorerValue>,
  ): Scorer {
    return { name, score };
  },
};
