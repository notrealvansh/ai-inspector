import { describe, expect, it } from "vitest";

import {
  createInspector,
  memoryExporter,
} from "../src/index.js";
import {
  instrumentAiSdk,
  mapAiSdkUsage,
  wrapEmbed,
  wrapGenerateText,
  wrapStreamText,
} from "../src/ai-sdk/index.js";
import { createClock } from "./helpers.js";

describe("AI SDK adapter", () => {
  it("records a generateText call, usage, tools, and cost", async () => {
    const clock = createClock();
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory], clock: clock.now });

    const fakeGenerate = async (_args: { model: unknown; prompt: string }) => {
      clock.advance(120);
      return {
        text: "Here is your answer.",
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        response: { modelId: "gpt-4o-mini" },
        toolCalls: [
          {
            toolName: "lookup_order",
            toolCallId: "call_1",
            input: { orderId: "A-17" },
          },
        ],
        toolResults: [{ toolCallId: "call_1", output: { status: "shipped" } }],
      };
    };

    const generateText = wrapGenerateText(inspector, fakeGenerate);
    const result = await generateText({
      model: { modelId: "gpt-4o-mini", provider: "openai" },
      prompt: "Where is my order?",
    });

    expect(result.text).toBe("Here is your answer.");
    const [trace] = memory.getTraces();
    expect(trace.name).toBe("generateText");
    expect(trace.spans).toHaveLength(1);
    const [span] = trace.spans;
    expect(span.kind).toBe("generation");
    expect(span.operation).toBe("generateText");
    expect(span.provider).toBe("openai");
    expect(span.model).toBe("gpt-4o-mini");
    expect(span.usage).toEqual({ inputTokens: 100, outputTokens: 20, totalTokens: 120 });
    expect(span.cost?.totalUsd).toBeCloseTo(0.000027, 10);
    expect(span.toolCalls?.[0]).toMatchObject({
      name: "lookup_order",
      id: "call_1",
      input: { orderId: "A-17" },
      output: { status: "shipped" },
    });
    expect(span.attributes["ai.finish_reason"]).toBe("stop");
  });

  it("does not start a second trace inside an active one", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const fakeGenerate = async () => ({ text: "ok", usage: { inputTokens: 1, outputTokens: 1 } });
    const generateText = wrapGenerateText(inspector, fakeGenerate);

    await inspector.trace("request", async () => {
      await generateText({ model: "gpt-4o-mini", prompt: "hi" } as never);
    });

    expect(memory.getTraces()).toHaveLength(1);
    expect(memory.getTraces()[0].name).toBe("request");
    expect(memory.getTraces()[0].spans).toHaveLength(1);
  });

  it("records failures and rethrows", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const generateText = wrapGenerateText(inspector, async () => {
      throw new Error("rate limited");
    });

    await expect(generateText({ model: "gpt-4o" } as never)).rejects.toThrow("rate limited");
    const [trace] = memory.getTraces();
    expect(trace.status).toBe("error");
    expect(trace.spans[0].status).toBe("error");
    expect(trace.spans[0].error?.message).toBe("rate limited");
  });

  it("observes streaming output, first token, and usage", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });

    async function* chunks() {
      yield "Hel";
      await Promise.resolve();
      yield "lo";
    }

    const streamResult = {
      textStream: chunks(),
      usage: Promise.resolve({ inputTokens: 30, outputTokens: 2 }),
      response: Promise.resolve({ modelId: "gpt-4o" }),
      text: Promise.resolve("Hello"),
    };
    const streamText = wrapStreamText(
      inspector,
      (_args: { prompt: string }) => streamResult,
    );
    const result = streamText({ prompt: "hi" });

    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
    }
    expect(text).toBe("Hello");

    const [trace] = memory.getTraces();
    expect(trace.status).toBe("ok");
    const [span] = trace.spans;
    expect(span.output).toEqual({ text: "Hello" });
    expect(span.usage).toEqual({ inputTokens: 30, outputTokens: 2 });
    expect(span.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
    expect(span.model).toBe("gpt-4o");
  });

  it("maps v4 and v5 usage shapes without inventing totals", () => {
    expect(mapAiSdkUsage({ promptTokens: 5, completionTokens: 3 })).toEqual({
      inputTokens: 5,
      outputTokens: 3,
    });
    expect(
      mapAiSdkUsage({
        inputTokens: 5,
        outputTokens: 3,
        inputTokenDetails: { cachedTokens: 2 },
      }),
    ).toEqual({ inputTokens: 5, outputTokens: 3, cachedInputTokens: 2 });
    expect(mapAiSdkUsage(undefined)).toBeUndefined();
  });

  it("records embeddings without storing vectors", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const embed = wrapEmbed(inspector, async () => ({
      embeddings: [[0.1, 0.2, 0.3]],
      usage: { tokens: 1_000 },
    }));

    await embed({ model: "text-embedding-3-small", value: "hello" } as never);
    const [trace] = memory.getTraces();
    const [span] = trace.spans;
    expect(span.kind).toBe("embedding");
    expect(span.output).toEqual({ count: 1, dimensions: 3 });
    expect(span.usage).toEqual({ inputTokens: 1_000, outputTokens: 0 });
    expect(span.cost?.totalUsd).toBeCloseTo(0.00002, 10);
  });

  it("wraps a module while keeping unwrapped functions intact", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const original = async () => ({ text: "ok" });
    const sdk = {
      generateText: original,
      version: "test",
    };

    const wrapped = instrumentAiSdk(inspector, sdk);
    expect(wrapped.version).toBe("test");
    await wrapped.generateText();
    expect(memory.getTraces()).toHaveLength(1);
    expect(sdk.generateText).toBe(original);
  });
});
