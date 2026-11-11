import { describe, expect, it, vi } from "vitest";

import {
  createInspector,
  memoryExporter,
  type SpanHandle,
  type TraceData,
} from "../src/index.js";
import { createClock } from "./helpers.js";

describe("traces", () => {
  it("records a trace and computes usage and cost from reported values", () => {
    const clock = createClock();
    const memory = memoryExporter();
    const inspector = createInspector({
      exporters: [memory],
      clock: clock.now,
      serviceName: "test-service",
    });

    const trace = inspector.startTrace({
      name: "chat",
      input: { prompt: "hello" },
      metadata: { requestId: "req_1" },
    });
    clock.advance(10);
    const generation = trace.generation({
      name: "answer",
      model: "gpt-4o-mini",
      provider: "openai",
    });
    clock.advance(25);
    generation.markFirstToken();
    clock.advance(75);
    generation.end({
      output: "hi there",
      usage: { inputTokens: 1_000, outputTokens: 500 },
    });
    trace.end();

    expect(memory.getTraces()).toHaveLength(1);
    const [recorded] = memory.getTraces();
    expect(recorded.name).toBe("chat");
    expect(recorded.status).toBe("ok");
    expect(recorded.durationMs).toBe(110);
    expect(recorded.attributes["service.name"]).toBe("test-service");
    expect(recorded.metadata.requestId).toBe("req_1");
    expect(recorded.spans).toHaveLength(1);

    const span = recorded.spans[0];
    expect(span.kind).toBe("generation");
    expect(span.model).toBe("gpt-4o-mini");
    expect(span.timeToFirstTokenMs).toBe(25);
    expect(span.durationMs).toBe(100);
    expect(span.usage).toEqual({ inputTokens: 1_000, outputTokens: 500 });
    expect(span.cost?.totalUsd).toBeCloseTo(0.00045, 10);
    expect(recorded.usage).toEqual({ inputTokens: 1_000, outputTokens: 500 });
    expect(recorded.cost?.totalUsd).toBeCloseTo(0.00045, 10);
    expect(recorded.sampled).toBe(true);
  });

  it("keeps parent relationships for nested spans", () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const trace = inspector.startTrace({ name: "agent" });
    const retrieval = trace.startSpan({ name: "retrieve", kind: "retrieval" });
    const tool = (retrieval as SpanHandle).startSpan({ name: "lookup", kind: "tool" });
    const generation = (retrieval as SpanHandle).generation({ name: "answer" });
    tool.end();
    generation.end();
    retrieval.end();
    trace.end();

    const [recorded] = memory.getTraces();
    const recordedRetrieval = recorded.spans.find((span) => span.name === "retrieve");
    const recordedTool = recorded.spans.find((span) => span.name === "lookup");
    expect(recordedTool?.parentId).toBe(recordedRetrieval?.id);
    expect(recordedRetrieval?.parentId).toBeUndefined();
  });

  it("wraps async work and records the returned value", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });

    const result = await inspector.trace("summarize", async (trace) => {
      const span = trace.startSpan({ name: "fetch-doc", kind: "retrieval" });
      span.end();
      return { summary: "done" };
    });

    expect(result).toEqual({ summary: "done" });
    const [recorded] = memory.getTraces();
    expect(recorded.status).toBe("ok");
    expect(recorded.output).toEqual({ summary: "done" });
  });

  it("records failures and rethrows the original error", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });

    await expect(
      inspector.trace("fail", async () => {
        throw new Error("model unavailable");
      }),
    ).rejects.toThrow("model unavailable");

    const [recorded] = memory.getTraces();
    expect(recorded.status).toBe("error");
    expect(recorded.error?.message).toBe("model unavailable");
  });

  it("marks unfinished spans instead of inventing a finish time", () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const trace = inspector.startTrace({ name: "forgot-to-end" });
    trace.startSpan({ name: "open" });
    trace.end();

    const [recorded] = memory.getTraces();
    expect(recorded.spans[0].status).toBe("unfinished");
    expect(recorded.spans[0].endedAt).toBeUndefined();
  });

  it("does not export sampled-out or disabled traces", () => {
    const memory = memoryExporter();
    const sampledOut = createInspector({ exporters: [memory], sampleRate: 0 });
    sampledOut.startTrace({ name: "skipped" }).end();
    expect(memory.getTraces()).toHaveLength(0);

    const disabled = createInspector({ exporters: [memory], enabled: false });
    disabled.startTrace({ name: "disabled" }).end();
    expect(memory.getTraces()).toHaveLength(0);
  });

  it("isolates exporter failures from application code", async () => {
    const onError = vi.fn();
    const inspector = createInspector({
      exporters: [
        {
          name: "broken",
          exportTrace() {
            throw new Error("disk full");
          },
        },
      ],
      onError,
    });

    expect(() => inspector.startTrace({ name: "ok" }).end()).not.toThrow();
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toContain("broken: disk full");
    await expect(inspector.flush()).resolves.toBeUndefined();
  });

  it("loads custom pricing overrides", () => {
    const inspector = createInspector({
      pricing: {
        "private-model": { inputPerMillion: 1, outputPerMillion: 2 },
      },
    });
    const trace = inspector.startTrace({ name: "custom" });
    const span = trace.generation({ name: "call", model: "private-model" });
    span.end({ usage: { inputTokens: 1_000_000, outputTokens: 1_000_000 } });
    trace.end();
    expect((trace.data as TraceData).cost?.totalUsd).toBe(3);
    expect((trace.data as TraceData).cost?.source).toBe("custom");
  });
});
