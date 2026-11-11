# Changelog

## 0.1.0

Initial release.

- Core inspector with traces, spans, token usage, latency, time to first token, costs, tool calls, errors, and evaluations.
- Capture modes for metadata-only, preview, and full payloads, with secret redaction and sampling.
- Console, memory, composite, JSONL file, and OTLP/HTTP exporters.
- Node preset using `AsyncLocalStorage` for concurrent trace isolation.
- Vercel AI SDK wrappers for text generation, object generation, streaming, and embeddings.
- OpenAI-compatible client proxy for chat, responses, and embeddings.
- Local CLI for listing, showing, summarizing, and clearing trace files.
- ESM, CommonJS, and TypeScript declarations for every entry point.
