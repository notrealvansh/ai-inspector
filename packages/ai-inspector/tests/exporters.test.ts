import { describe, expect, it, vi } from "vitest";

import {
  consoleExporter,
  createInspector,
  formatCost,
  formatDuration,
  formatTrace,
  memoryExporter,
} from "../src/index.js";
import { createClock } from "./helpers.js";

describe("exporters", () => {
  it("drops the oldest traces when the memory buffer is full", () => {
    const memory = memoryExporter({ capacity: 2 });
    const inspector = createInspector({ exporters: [memory] });
    for (const name of ["one", "two", "three"]) {
      inspector.startTrace({ name }).end();
    }
    expect(memory.getTraces().map((trace) => trace.name)).toEqual(["two", "three"]);
  });

  it("formats a compact console summary", () => {
    const clock = createClock();
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory], clock: clock.now });
    const trace = inspector.startTrace({ name: "support-agent" });
    const retrieval = trace.startSpan({ name: "search-docs", kind: "retrieval" });
    clock.advance(12);
    retrieval.end();
    const generation = trace.generation({
      name: "answer",
      model: "gpt-4o-mini",
      provider: "openai",
    });
    clock.advance(240);
    generation.end({
      output: "Done",
      usage: { inputTokens: 1_250, outputTokens: 300 },
    });
    trace.end();

    const [recorded] = memory.getTraces();
    const lines = formatTrace(recorded).join("\n");
    expect(lines).toContain("[trace] support-agent");
    expect(lines).toContain("support-agent");
    expect(lines).toContain("answer");
    expect(lines).toContain("gpt-4o-mini");
    expect(lines).toContain("in 1.3k");
    expect(lines).toContain("out 300");
    expect(lines).toContain("$0.000367");
    expect(formatTrace(recorded, { colors: true }).join("\n")).toContain("\u001b[");
  });

  it("respects the enabled flag and custom logger", () => {
    const log = vi.fn();
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    inspector.startTrace({ name: "quiet" }).end();

    const silent = consoleExporter({ enabled: false, colors: false, log });
    silent.exportTrace(memory.getTraces()[0]);
    expect(log).not.toHaveBeenCalled();

    const loud = consoleExporter({ colors: false, log });
    loud.exportTrace(memory.getTraces()[0]);
    expect(log).toHaveBeenCalled();
  });

  it("formats durations and costs without pretending to know missing values", () => {
    expect(formatDuration(undefined)).toBe("-");
    expect(formatDuration(0.4)).toBe("<1ms");
    expect(formatDuration(1_240)).toBe("1.24s");
    expect(formatCost(undefined)).toBe("");
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.0000001)).toBe("<$0.000001");
  });

  it("reports async exporter errors on flush", async () => {
    const onError = vi.fn();
    const inspector = createInspector({
      exporters: [
        {
          name: "remote",
          async exportTrace() {
            throw new Error("connection refused");
          },
        },
      ],
      onError,
    });

    inspector.startTrace({ name: "remote-test" }).end();
    await inspector.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0].message).toContain("remote: connection refused");
  });
});
