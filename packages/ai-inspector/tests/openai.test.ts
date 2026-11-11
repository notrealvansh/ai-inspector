import { describe, expect, it } from "vitest";

import { createInspector, memoryExporter } from "../src/index.js";
import { instrumentOpenAI } from "../src/openai/index.js";

describe("OpenAI-compatible adapter", () => {
  it("records a chat completion and leaves the client untouched", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const create = async (_params: {
      model: string;
      messages: unknown[];
    }) => ({
      model: "gpt-4o-mini",
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "Checking that order.",
            tool_calls: [
              {
                id: "call_9",
                type: "function",
                function: {
                  name: "lookup_order",
                  arguments: '{"orderId":"A-17"}',
                },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 },
    });
    const client = {
      chat: { completions: { create } },
      models: { list: async () => [] },
    };

    const wrapped = instrumentOpenAI(inspector, client);
    expect(wrapped).not.toBe(client);
    expect(wrapped.chat.completions.create).not.toBe(create);
    expect(client.chat.completions.create).toBe(create);

    const response = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Where is A-17?" }],
    });
    expect(response.model).toBe("gpt-4o-mini");

    const [trace] = memory.getTraces();
    expect(trace.name).toBe("openai.chat");
    const [span] = trace.spans;
    expect(span.kind).toBe("generation");
    expect(span.operation).toBe("chat.completions.create");
    expect(span.usage).toEqual({
      inputTokens: 120,
      outputTokens: 18,
      totalTokens: 138,
    });
    expect(span.output).toEqual({
      text: "Checking that order.",
      finishReason: "tool_calls",
    });
    expect(span.toolCalls?.[0]).toMatchObject({
      name: "lookup_order",
      id: "call_9",
      input: { orderId: "A-17" },
    });
    expect(span.cost?.totalUsd).toBeGreaterThan(0);
  });

  it("records embeddings and uses the configured provider label", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const client = {
      embeddings: {
        create: async (_params: { model: string; input: string }) => ({
          model: "text-embedding-3-small",
          data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
          usage: { prompt_tokens: 1_000 },
        }),
      },
    };

    const wrapped = instrumentOpenAI(inspector, client, { provider: "azure-openai" });
    await wrapped.embeddings.create({
      model: "text-embedding-3-small",
      input: "hello",
    });

    const [trace] = memory.getTraces();
    expect(trace.name).toBe("openai.embeddings");
    const [span] = trace.spans;
    expect(span.kind).toBe("embedding");
    expect(span.provider).toBe("azure-openai");
    expect(span.output).toEqual({ count: 1, dimensions: 4 });
    expect(span.usage).toEqual({ inputTokens: 1_000, outputTokens: 0 });
    expect(span.cost?.totalUsd).toBeCloseTo(0.00002, 10);
  });

  it("observes streamed chat chunks", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });

    async function* chunks() {
      yield {
        model: "gpt-4o-mini",
        choices: [{ delta: { content: "Hi " } }],
      };
      await Promise.resolve();
      yield {
        model: "gpt-4o-mini",
        choices: [{ delta: { content: "there" } }],
      };
      yield {
        model: "gpt-4o-mini",
        choices: [{ delta: {} }],
        usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
      };
    }

    const client = {
      chat: {
        completions: {
          create: async (_params: { model: string; stream: boolean }) => chunks(),
        },
      },
    };
    const wrapped = instrumentOpenAI(inspector, client);
    const stream = await wrapped.chat.completions.create({
      model: "gpt-4o-mini",
      stream: true,
    });

    let text = "";
    for await (const chunk of stream as AsyncIterable<{
      choices: Array<{ delta: { content?: string } }>;
    }>) {
      text += chunk.choices[0]?.delta.content ?? "";
    }
    expect(text).toBe("Hi there");

    const [trace] = memory.getTraces();
    expect(trace.status).toBe("ok");
    const [span] = trace.spans;
    expect(span.output).toEqual({ text: "Hi there" });
    expect(span.usage).toEqual({
      inputTokens: 8,
      outputTokens: 2,
      totalTokens: 10,
    });
    expect(span.timeToFirstTokenMs).toBeGreaterThanOrEqual(0);
  });

  it("never starts a second trace inside an active one", async () => {
    const memory = memoryExporter();
    const inspector = createInspector({ exporters: [memory] });
    const client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: "ok" } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
        },
      },
    };
    const wrapped = instrumentOpenAI(inspector, client);

    await inspector.trace("my-request", async () => {
      await wrapped.chat.completions.create();
    });

    expect(memory.getTraces()).toHaveLength(1);
    expect(memory.getTraces()[0].name).toBe("my-request");
    expect(memory.getTraces()[0].spans).toHaveLength(1);
  });
});
