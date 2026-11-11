# @lithiumdevs/ai-inspector

Traces for TypeScript AI applications. Record model calls, prompts, responses, token usage, latency, time to first token, tool calls, errors, estimated cost, and evaluation scores. Traces stay on your machine unless you add an exporter.

Scope: `@lithiumdevs/ai-inspector`. Use this until you claim your own npm scope.

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
