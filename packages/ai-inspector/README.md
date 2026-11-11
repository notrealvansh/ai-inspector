# @lithiumdevs/ai-inspector

Traces for TypeScript AI applications. Record model calls, prompts, responses, token usage, latency, time to first token, tool calls, errors, estimated cost, and evaluation scores. Traces stay on your machine unless you add an exporter.

Package: `@lithiumdevs/ai-inspector`.

Source: https://github.com/notrealvansh/ai-inspector

- Framework-agnostic core with no runtime dependencies
- Node preset writes newline-delimited JSON locally, no account or API key
- Explicit Vercel AI SDK and OpenAI-compatible adapters
- OTLP/HTTP export for OpenTelemetry collectors
- Capture controls, secret redaction, and sampling
- Streaming support with time to first token
- Small deterministic scorers for evaluation checks
- CLI for reading local trace files

Requires Node 18.17 or newer for the Node entry point. The core also runs in browsers and edge runtimes.

## Install

```bash
npm install @lithiumdevs/ai-inspector
# pnpm add @lithiumdevs/ai-inspector
# bun add @lithiumdevs/ai-inspector
```

## Quick start

The Node preset writes newline-delimited JSON by default. Install the package, start a trace, and look at what landed. The quickstart uses `AsyncLocalStorage` for context propagation and writes one JSON object per trace to `.ai-inspector/traces.ndjson`.

```ts
import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";

const inspector = createNodeInspector({
  serviceName: "support-api",
  capture: { mode: "preview" },
});

const answer = await inspector.trace("support-request", async (trace) => {
  const retrieval = trace.startSpan({
    name: "search-docs",
    kind: "retrieval",
    input: { query: "return policy" },
  });
  const docs = await searchDocs("return policy");
  retrieval.end({ output: { matches: docs.length } });

  const generation = trace.generation({
    name: "answer",
    model: "gpt-4o-mini",
    provider: "openai",
    input: { question: "Can I return this?" },
  });

  const response = await model.generate("Can I return this?");
  generation.end({
    output: response.text,
    usage: response.usage,
  });

  return response.text;
});
```

The trace is exported when `inspector.trace` finishes. File writes are serialized, so call `await inspector.flush()` before a short-lived process exits. To avoid writing a file, use `createNodeInspector({ file: false })` and add your own exporters.

If you only need browser or framework-neutral tracing, use the core:

```ts
import { createInspector, consoleExporters } from "@lithiumdevs/ai-inspector";

const inspector = createInspector({
  exporters: [consoleExporters()],
});
```

## Vercel AI SDK

Pass the SDK functions you want observed. The wrapper does not modify the SDK and keeps your existing types.

```ts
import { generateText, streamText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";
import { instrumentAiSdk } from "@lithiumdevs/ai-inspector/ai-sdk";

const inspector = createNodeInspector({ serviceName: "chat-api" });
const ai = instrumentAiSdk(inspector, { generateText, streamText });

const result = await ai.generateText({
  model: openai("gpt-4o-mini"),
  prompt: "Summarize this ticket",
});
```

Wrap upstream calls in `inspector.trace` to group several steps into one trace. Used on its own, each wrapped call becomes a trace.

Supported wrappers: `generateText`, `generateObject`, `streamText`, `embed`, and `embedMany`. Usage is read from both older (`promptTokens`) and newer (`inputTokens`) SDK shapes. Streaming spans close when `textStream`, `fullStream`, or `consumeStream` is consumed.

## OpenAI-compatible APIs

`instrumentOpenAI` returns a proxy. The original client is untouched, and `fetch` is never patched.

```ts
import OpenAI from "openai";
import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";
import { instrumentOpenAI } from "@lithiumdevs/ai-inspector/openai";

const inspector = createNodeInspector({ serviceName: "agent" });
const openai = instrumentOpenAI(inspector, new OpenAI(), {
  provider: "openai",
});

const completion = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Where is order A-17?" }],
});
```

Intercepted resources are `chat.completions.create`, `responses.create`, and `embeddings.create`. Streaming chat is followed to the final chunk so usage is not lost. If you point the OpenAI SDK at another compatible provider, pass its name with `provider`.

## Manual traces and spans

```ts
const trace = inspector.startTrace({
  name: "agent-run",
  metadata: { sessionId: "s_123" },
  tags: ["agent"],
});

const generation = trace.generation({
  name: "plan",
  model: "claude-sonnet-4-5",
  provider: "anthropic",
});

generation.recordInput({ task: "book a flight" });
generation.markFirstToken();
generation.end({
  output: { plan: ["search", "quote", "book"] },
  usage: { inputTokens: 820, outputTokens: 96 },
});

trace.end();
```

Span methods return the handle, so calls can be chained. `fail(error)` records the serialized error and marks the span or trace as failed. Ending a trace closes any spans that were never ended as `unfinished`; it does not invent an end time for them.

Child spans can be created from a span:

```ts
const tool = trace.startSpan({ name: "lookup_order", kind: "tool" });
tool.addEvent("cache_miss");
const child = tool.startSpan({ name: "db_query", kind: "custom" });
child.end();
tool.end();
```

Async context is available in Node through the Node preset. In browsers and runtimes without `AsyncLocalStorage`, the core falls back to a synchronous stack. Pass explicit trace or span handles across async boundaries in those environments.

## Capture and privacy

The default capture mode is `preview`: strings are truncated at 800 characters, arrays at 25 items, and common credential keys are redacted. Inputs and outputs are never sent anywhere without an exporter.

```ts
const inspector = createInspector({
  capture: {
    mode: "metadata", // drop prompts and responses entirely
    maxStringLength: 500,
    redactKeys: ["customer_email"],
    redact(value, path) {
      if (path.endsWith("phone")) return "[phone]";
      return value;
    },
  },
});
```

Modes:

| Mode | Inputs and outputs | Metadata, usage, timings |
| --- | --- | --- |
| `metadata` | Dropped | Kept |
| `preview` | Truncated and redacted | Kept |
| `full` | Kept, secret keys still redacted | Kept |

Metadata you attach to a trace is sanitized but not dropped in `metadata` mode. Token counts are never estimated; if a provider does not report one, the field is absent. Costs are estimates from the pricing table, not provider invoices.

Sampling uses `sampleRate` from 0 to 1. Non-sampled traces still execute normally but are not exported.

## Costs

Costs are calculated only when a model has a price and both input and output token counts were reported. Cached input rates are applied when the provider reports cached tokens.

The built-in table is a convenience, not a repriced API. Rates change, and provider agreements differ. Override any model:

```ts
const inspector = createInspector({
  pricing: {
    "my-fine-tune": { inputPerMillion: 0.8, outputPerMillion: 1.6 },
  },
});
```

Embedding spans report zero output tokens because embedding models do not generate output tokens. That lets their input cost be calculated without making up a completion count.

## Evaluations

Scorers are plain functions and run locally. No judge model is required.

```ts
import { scorers } from "@lithiumdevs/ai-inspector";

const scores = await inspector.evaluate({
  name: "answer-quality",
  input: question,
  output: answer,
  expected: "shipped",
  scorers: [
    scorers.includes("shipped"),
    scorers.matches(/within \d+ days/),
    scorers.isJson(),
    scorers.custom("short", ({ output }) => String(output).length < 280),
  ],
  threshold: 0.8,
});
```

Built-in scorers: `exactMatch`, `includes`, `matches`, `isJson`, `maxLength`, `oneOf`, and `custom`. Each result has a score from 0 to 1, a pass flag, and an optional reason. A scorer that throws produces a failed result instead of breaking the request.

Wrap an evaluation in `inspector.trace` to attach it to an application trace. Called on its own, `evaluate` creates a trace named `eval:<name>`.

## OpenTelemetry

Export the same traces to any OTLP/HTTP collector. Trace and span ids are W3C/OpenTelemetry compatible, and generation spans carry `gen_ai.*` attributes.

```ts
import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";
import { otlpHttpExporter } from "@lithiumdevs/ai-inspector/otel";

const inspector = createNodeInspector({
  file: false,
  exporters: [
    otlpHttpExporter({
      endpoint: "http://localhost:4318",
      serviceName: "support-api",
      headers: { "x-collector-token": process.env.COLLECTOR_TOKEN ?? "" },
    }),
  ],
});
```

A base endpoint gets `/v1/traces` appended. Full `/v1/traces` URLs are accepted. Input and output payloads are exported as `ai_inspector.input` and `ai_inspector.output` attributes, so keep capture settings and collector retention in mind.

The package does not bundle the OpenTelemetry SDK. It emits OTLP directly, which keeps install size and dependency surface small.

## CLI

Local traces are readable without this package's dashboard:

```bash
npx @lithiumdevs/ai-inspector list
npx @lithiumdevs/ai-inspector show last
npx @lithiumdevs/ai-inspector show 4f2a1c0b --json
npx @lithiumdevs/ai-inspector stats
npx @lithiumdevs/ai-inspector clear --yes
```

Once installed, the binary is available as `ai-inspector`.

The default file is `.ai-inspector/traces.ndjson`. Override it with `--file path` or `AI_INSPECTOR_FILE`.

## Exports

| Import | Purpose |
| --- | --- |
| `@lithiumdevs/ai-inspector` | Core inspector, types, exporters, scorers, pricing |
| `@lithiumdevs/ai-inspector/node` | Async context, JSONL file exporter, Node preset |
| `@lithiumdevs/ai-inspector/ai-sdk` | AI SDK wrappers |
| `@lithiumdevs/ai-inspector/openai` | OpenAI-compatible client proxy |
| `@lithiumdevs/ai-inspector/otel` | OTLP/HTTP exporter and mapper |
| `ai-inspector` | CLI |

All entry points ship ESM, CommonJS, TypeScript declarations.

## API overview

```ts
createInspector(options): Inspector
inspector.startTrace(options): TraceHandle
inspector.trace(name, fn, options?): Promise<T>
inspector.startSpan(options): SpanHandle
inspector.generation(options): GenerationHandle
inspector.evaluate(options): Promise<EvaluationResult[]>
inspector.flush(): Promise<void>
inspector.shutdown(): Promise<void>
```

Exporter failure never propagates into the instrumented application. Use `onError` to route failures to your logger and `debug: true` to see dropped spans and setup warnings.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run build
```

The test suite covers trace lifecycles, async context isolation, capture redaction, pricing, exports, evals, adapters, streaming, and OTLP mapping.

## Contributing

See the repository CONTRIBUTING guide. The repository also includes a code of conduct and a security policy.

## Repository

Issues and source are on GitHub:

- Source: https://github.com/notrealvansh/ai-inspector
- Issues: https://github.com/notrealvansh/ai-inspector/issues

The repository includes GitHub collaboration files for the package: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue templates, a pull request template, and a CI workflow that typechecks, tests, builds, and validates the package.

## Publishing

This package is published as `@lithiumdevs/ai-inspector` on npm. The release
commands are run from the package directory:

```bash
cd packages/ai-inspector
npm version patch  # or minor / major
npm publish
```

The `prepublishOnly` script builds and tests before publishing.

## License

MIT
