import { describe, expect, it } from "vitest";

import {
  createInspector,
  memoryExporter,
  runScorers,
  scorers,
} from "../src/index.js";

describe("evaluations", () => {
  it("runs deterministic scorers with a threshold", async () => {
    const results = await runScorers({
      output: "The order shipped yesterday.",
      expected: "shipped",
      scorers: [
        scorers.includes("shipped"),
        scorers.matches(/yesterday\.$/),
        scorers.maxLength(10),
        scorers.isJson(),
      ],
      threshold: 0.8,
    });

    expect(results).toHaveLength(4);
    expect(results[0]).toMatchObject({ scorer: "includes", score: 1, passed: true });
    expect(results[1]).toMatchObject({ scorer: "matches", score: 1, passed: true });
    expect(results[2]).toMatchObject({ scorer: "max_length", score: 0, passed: false });
    expect(results[3]).toMatchObject({ scorer: "is_json", score: 0, passed: false });
  });

  it("survives a scorer that throws", async () => {
    const results = await runScorers({
      output: "x",
      scorers: [
        scorers.custom("explodes", () => {
          throw new Error("bad scorer");
        }),
      ],
    });
    expect(results[0].score).toBe(0);
    expect(results[0].reason).toContain("bad scorer");
  });

  it("records an evaluation span on the active trace", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });

    const result = await inspector.trace("answer", async () => {
      return inspector.evaluate({
        name: "quality",
        input: "Where is my order?",
        output: "It shipped yesterday.",
        expected: "shipped",
        scorers: [scorers.includes("shipped"), scorers.isJson()],
      });
    });

    expect(result).toHaveLength(2);
    const [recorded] = memory.getTraces();
    expect(recorded.spans).toHaveLength(1);
    expect(recorded.spans[0].kind).toBe("evaluation");
    expect(recorded.spans[0].evaluations).toHaveLength(2);
    expect(recorded.spans[0].evaluations?.[0].passed).toBe(true);
  });

  it("creates its own trace when called outside one", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    await inspector.evaluate({
      name: "standalone",
      output: "42",
      expected: "42",
      scorers: [scorers.exactMatch()],
    });

    expect(memory.getTraces()).toHaveLength(1);
    expect(memory.getTraces()[0].name).toBe("eval:standalone");
  });

  it("supports async custom scorers", async () => {
    const results = await runScorers({
      output: { answer: "yes" },
      scorers: [
        scorers.custom("custom", async () => ({
          score: 0.9,
          reason: "close enough",
        })),
      ],
    });
    expect(results[0]).toMatchObject({
      scorer: "custom",
      score: 0.9,
      passed: true,
      reason: "close enough",
    });
  });
});
