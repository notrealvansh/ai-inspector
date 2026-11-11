import { describe, expect, it, vi } from "vitest";

import { createInspector, memoryExporter, type TraceData } from "../src/index.js";
import {
  otlpHttpExporter,
  traceToOtlp,
  type OtlpAttribute,
  type OtlpPayload,
} from "../src/otel/index.js";
import { createClock } from "./helpers.js";

function attributeValue(attributes: OtlpAttribute[], key: string) {
  const attribute = attributes.find((entry) => entry.key === key);
  return (
    attribute?.value.stringValue ??
    attribute?.value.intValue ??
    attribute?.value.doubleValue ??
    attribute?.value.boolValue
  );
}

function sampleTrace(): TraceData {
  const clock = createClock();
  const memory = memoryExporter();
  const inspector = createInspector({
    exporters: [memory],
    clock: clock.now,
    serviceName: "checkout-api",
  });
  const trace = inspector.startTrace({
    name: "support-agent",
    input: { question: "Where is order A-17?" },
    metadata: { customer: "acme" },
    tags: ["prod", "canary"],
  });
  const generation = trace.generation({
    name: "answer",
    model: "gpt-4o-mini",
    provider: "openai",
  });
  clock.advance(90);
  generation.addEvent("cache_lookup", { hit: false });
  generation.end({
    output: { text: "It shipped." },
    usage: { inputTokens: 100, outputTokens: 12, totalTokens: 112 },
  });
  trace.end({ output: { text: "It shipped." } });
  return memory.getTraces()[0];
}

describe("OTLP export", () => {
  it("maps trace ids, parents, and GenAI attributes", () => {
    const trace = sampleTrace();
    const payload = traceToOtlp(trace, { serviceName: "checkout-api" });
    const scope = payload.resourceSpans[0].scopeSpans[0];
    expect(scope.scope.name).toBe("@lithiumdevs/ai-inspector");
    expect(scope.spans).toHaveLength(2);

    const root = scope.spans[0];
    const child = scope.spans[1];
    expect(root.name).toBe("support-agent");
    expect(root.spanId).toBe(trace.rootSpanId);
    expect(root.traceId).toBe(trace.id);
    expect(child.parentSpanId).toBe(trace.rootSpanId);
    expect(child.traceId).toBe(trace.id);
    expect(child.spanId).toHaveLength(16);
    expect(child.traceId).toHaveLength(32);

    expect(attributeValue(child.attributes, "gen_ai.operation.name")).toBe("chat");
    expect(attributeValue(child.attributes, "gen_ai.provider.name")).toBe("openai");
    expect(attributeValue(child.attributes, "gen_ai.request.model")).toBe("gpt-4o-mini");
    expect(attributeValue(child.attributes, "gen_ai.usage.input_tokens")).toBe("100");
    expect(attributeValue(child.attributes, "gen_ai.usage.output_tokens")).toBe("12");
    expect(attributeValue(child.attributes, "gen_ai.usage.total_tokens")).toBe("112");
    expect(attributeValue(child.attributes, "ai_inspector.cost_usd")).toBeCloseTo(
      0.0000222,
      10,
    );
    expect(attributeValue(root.attributes, "ai_inspector.trace.status")).toBe("ok");
    expect(attributeValue(root.attributes, "ai_inspector.tags")).toContain("prod");
    expect(child.events?.[0].name).toBe("cache_lookup");
    expect(
      attributeValue(payload.resourceSpans[0].resource.attributes, "service.name"),
    ).toBe("checkout-api");
  });

  it("sets error status and exception events without dropping spans", () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const trace = inspector.startTrace({ name: "failed-run" });
    const span = trace.generation({ name: "model", model: "gpt-4o" });
    span.fail(new Error("upstream 500"));
    trace.fail(new Error("request failed"));

    const payload = traceToOtlp(memory.getTraces()[0]);
    const [root, child] = payload.resourceSpans[0].scopeSpans[0].spans;
    expect(root.status?.code).toBe(2);
    expect(root.events?.[0].name).toBe("exception");
    expect(child.status?.code).toBe(2);
    expect(child.events?.[0].name).toBe("exception");
  });

  it("posts OTLP JSON to the collector endpoint", async () => {
    const trace = sampleTrace();
    const calls: Array<{ url: string; init?: { body?: string } }> = [];
    const exporter = otlpHttpExporter({
      endpoint: "http://localhost:4318",
      headers: { "x-api-key": "test" },
      fetch: async (url, init) => {
        calls.push({ url, ...(init ? { init } : {}) });
        return { ok: true, status: 200 };
      },
    });

    await exporter.exportTrace(trace);
    expect(calls[0].url).toBe("http://localhost:4318/v1/traces");
    const payload = JSON.parse(calls[0].init?.body ?? "{}") as OtlpPayload;
    expect(payload.resourceSpans).toHaveLength(1);
  });

  it("surfaces a non-2xx response as an error", async () => {
    const trace = sampleTrace();
    const exporter = otlpHttpExporter({
      endpoint: "http://localhost:4318/v1/traces",
      fetch: async () => ({
        ok: false,
        status: 401,
        text: async () => "unauthorized",
      }),
    });

    await expect(exporter.exportTrace(trace)).rejects.toThrow(
      "OTLP export failed with status 401: unauthorized",
    );
  });

  it("wires into the inspector without throwing from export calls", async () => {
    const onError = vi.fn();
    const fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    const inspector = createInspector({
      exporters: [otlpHttpExporter({ endpoint: "http://collector:4318", fetch })],
      onError,
    });
    inspector.startTrace({ name: "remote" }).end();
    await inspector.flush();
    expect(onError).toHaveBeenCalledOnce();
  });
});
