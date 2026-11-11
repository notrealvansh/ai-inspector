import { describe, expect, it } from "vitest";

import { createSanitizer, createInspector, memoryExporter } from "../src/index.js";

describe("payload capture", () => {
  it("drops inputs and outputs in metadata mode", () => {
    const memory = memoryExporter();
    const inspector = createInspector({
      capture: { mode: "metadata" },
      exporters: [memory],
    });
    const trace = inspector.startTrace({
      name: "private",
      input: "secret prompt",
      metadata: { tenant: "acme" },
    });
    const span = trace.generation({ name: "call", input: "secret prompt" });
    span.end({ output: "secret answer", usage: { inputTokens: 2, outputTokens: 3 } });
    trace.end({ output: "secret answer" });

    const [recorded] = memory.getTraces();
    expect(recorded.input).toBeUndefined();
    expect(recorded.output).toBeUndefined();
    expect(recorded.metadata.tenant).toBe("acme");
    expect(recorded.spans[0].input).toBeUndefined();
    expect(recorded.spans[0].output).toBeUndefined();
    expect(recorded.spans[0].usage).toEqual({ inputTokens: 2, outputTokens: 3 });
  });

  it("truncates strings and redacts secret-looking keys in preview mode", () => {
    const sanitizer = createSanitizer({ maxStringLength: 10 });
    const result = sanitizer.sanitize({
      prompt: "a very long prompt that should be cut",
      apiKey: "sk-live-123",
      nested: {
        headers: { Authorization: "Bearer token" },
        password: "hunter2",
      },
    });

    expect(result).toEqual({
      prompt: "a very lon…",
      apiKey: "[REDACTED]",
      nested: {
        headers: { Authorization: "[REDACTED]" },
        password: "[REDACTED]",
      },
    });
  });

  it("keeps full payloads but still redacts keys", () => {
    const sanitizer = createSanitizer({ mode: "full" });
    const long = "x".repeat(2_000);
    const result = sanitizer.sanitize({ text: long, token: "hidden" }) as {
      text: string;
      token: string;
    };
    expect(result.text).toHaveLength(2_000);
    expect(result.token).toBe("[REDACTED]");
  });

  it("supports custom redaction and circular references", () => {
    const sanitizer = createSanitizer({
      redact(value, path) {
        if (path.endsWith("email")) return "[email]";
        return value;
      },
    });
    const source: Record<string, unknown> = {
      customer: "Jamie",
      email: "jamie@example.com",
    };
    source.self = source;

    const result = sanitizer.sanitize(source) as Record<string, unknown>;
    expect(result.email).toBe("[email]");
    expect(result.customer).toBe("Jamie");
    expect(result.self).toBe("[Circular]");
  });

  it("collects primitive attributes and stringifies objects", () => {
    const sanitizer = createSanitizer();
    expect(
      sanitizer.sanitizeAttributes({
        ok: true,
        count: 3,
        name: "test",
        nested: { a: 1 },
        missing: null,
      }),
    ).toEqual({ ok: true, count: 3, name: "test", nested: '{"a":1}' });
  });
});
