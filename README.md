AI Inspector

Local-first observability for TypeScript AI applications.

AI Inspector records what happens inside an AI application: model calls, prompts and responses, token usage, latency, tool executions, errors and evaluation results.

Traces are stored locally by default using the Node.js exporter. OpenTelemetry export is also supported.

Get started without creating a hosted account or configuring a provider API key.

""npm version" (https://img.shields.io/npm/v/@lithiumdevs/ai-inspector)" (https://www.npmjs.com/package/@lithiumdevs/ai-inspector)
""npm downloads" (https://img.shields.io/npm/dm/@lithiumdevs/ai-inspector)" (https://www.npmjs.com/package/@lithiumdevs/ai-inspector)
""License" (https://img.shields.io/badge/license-MIT-blue.svg)" (https://opensource.org/license/mit)

npm: "@lithiumdevs/ai-inspector" (https://www.npmjs.com/package/@lithiumdevs/ai-inspector)

Features

- Tracing: Record model calls, prompts, responses and nested spans.
- Token usage: Capture input and output token counts.
- Latency: Measure request duration and time to first token.
- Tool calls: Record tool execution details within a trace.
- Errors: Keep failures attached to the relevant trace.
- Cost estimates: Calculate estimated costs using configured model pricing.
- Evaluations: Run scorers and attach results to traces.
- Local storage: Write traces to NDJSON files.
- OpenTelemetry: Export traces over OTLP/HTTP.
- Capture controls: Configure redaction, sampling and captured fields.

Installation

npm install @lithiumdevs/ai-inspector

Quick start

This example records a generation span using sample data.

import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";

const inspector = createNodeInspector({
  serviceName: "my-ai-app",
});

await inspector.trace("example-request", async (trace) => {
  const generation = trace.generation({
    name: "chat-completion",
    model: "example-model",
    provider: "custom",
  });

  generation.end({
    output: "Hello from my application",
    usage: {
      inputTokens: 10,
      outputTokens: 5,
    },
  });
});

await inspector.flush();
await inspector.shutdown();

This example uses sample values and does not make a real model request. Use one of the available integrations to trace actual provider calls.

Integrations

Entry point| Description
"@lithiumdevs/ai-inspector"| Core tracing API
"@lithiumdevs/ai-inspector/node"| Node.js preset and local exporter
"@lithiumdevs/ai-inspector/ai-sdk"| Vercel AI SDK integration
"@lithiumdevs/ai-inspector/openai"| OpenAI-compatible client integration
"@lithiumdevs/ai-inspector/otel"| OTLP/HTTP exporter

See the "package documentation" (packages/ai-inspector/README.md) for setup instructions and integration examples.

Command-line interface

The CLI can inspect traces written by the local exporter.

npx ai-inspector list
npx ai-inspector show <trace-id>
npx ai-inspector stats

Web workbench

This repository also contains a web workbench built with Vite, React and Convex.

It provides a dashboard for browsing traces and inspecting individual spans.

The playground runs sample scenarios through the inspector core. Its model responses are simulated and labelled in the interface. These scenarios do not make real provider requests.

Development

Requirements

- Bun for the repository and workbench.
- Node.js 18.17 or newer for the Node.js package.

Install dependencies

bun install

Run package checks

cd packages/ai-inspector
bun run typecheck
bun run test
bun run build

Start the workbench

From the repository root:

bun run dev

The workbench requires a configured Convex deployment. Set "VITE_CONVEX_URL" and configure the required backend environment variables before using deployment-backed features.

Keep private provider credentials in backend environment variables, not in the Vite client.

Repository structure

ai-inspector/
├── packages/
│   └── ai-inspector/   Published npm package
├── src/                Documentation and web workbench
│   └── convex/         Convex schema and backend functions
└── README.md

Contributing

Contributions, bug reports and documentation improvements are welcome.

- "Contribution guidelines" (.github/CONTRIBUTING.md)
- "Report an issue" (https://github.com/notrealvansh/ai-inspector/issues)
- "Security policy" (.github/SECURITY.md)
- "Code of conduct" (.github/CODE_OF_CONDUCT.md)

License

MIT.
