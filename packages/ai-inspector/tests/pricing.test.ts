import { describe, expect, it } from "vitest";

import { builtInPricing, estimateCost, findPricing } from "../src/index.js";

describe("pricing", () => {
  it("matches model names with dates and provider prefixes", () => {
    expect(findPricing("openai/gpt-4o-2024-08-06")?.pricing).toBe(
      builtInPricing["gpt-4o"],
    );
    expect(findPricing("anthropic/claude-sonnet-4.5")?.pricing).toBe(
      builtInPricing["claude-sonnet-4-5"],
    );
  });

  it("prefers a custom entry", () => {
    const match = findPricing("gpt-4o", {
      "gpt-4o": { inputPerMillion: 1, outputPerMillion: 2 },
    });
    expect(match?.source).toBe("custom");
    expect(match?.pricing.outputPerMillion).toBe(2);
  });

  it("does not guess a price for an unknown model", () => {
    expect(findPricing("unknown-model")).toBeUndefined();
  });

  it("applies cached input pricing when reported", () => {
    const match = findPricing("gpt-4o");
    expect(match).toBeDefined();
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 0, cachedInputTokens: 500_000 },
      match!,
    );
    expect(cost?.inputUsd).toBeCloseTo(1.875, 10);
    expect(cost?.totalUsd).toBeCloseTo(1.875, 10);
  });

  it("refuses to calculate a partial cost", () => {
    const match = findPricing("gpt-4o")!;
    expect(estimateCost({ inputTokens: 1_000, totalTokens: 1_000 }, match)).toBeUndefined();
    expect(estimateCost({ totalTokens: 1_000 }, match)).toBeUndefined();
    expect(
      estimateCost(
        { inputTokens: 10, outputTokens: 5, cachedInputTokens: 20 },
        match,
      ),
    ).toBeUndefined();
  });
});
