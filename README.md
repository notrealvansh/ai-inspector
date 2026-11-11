AI Inspector

A lightweight observability toolkit for TypeScript AI applications.

AI Inspector helps you inspect what's happening inside your AI application. It records model requests, responses, token usage, latency, tool calls and errors, making it easier to understand and debug your application.

Traces are stored locally in NDJSON format by default. OpenTelemetry export is also supported.

No hosted account or API key is needed to get started.

Package: ""@lithiumdevs/ai-inspector"" (https://www.npmjs.com/package/@lithiumdevs/ai-inspector)

Features

- Request tracing — Record model calls, prompts and responses.
- Token tracking — Capture input and output token usage.
- Latency monitoring — Measure request duration and time to first token.
- Tool tracking — Inspect tool calls and their results.
- Error recording — Keep track of failed requests and execution errors.
- Cost estimation — Estimate usage costs using configured model pricing.
- Evaluation support — Run scorers and record evaluation results.
- Local storage — Save traces to an NDJSON file.
- OpenTelemetry — Export traces using OTLP/HTTP.
- Data controls — Configure redaction, sampling and what gets captured.

Installation

npm install @lithiumdevs/ai-inspector

Quick start

Create an inspector and record your first trace:

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

This example records a generation with sample data. Connect an actual model provider or use one of the available integrations to trace real requests.

Integrations

AI Inspector includes separate entry points for different environments and providers.

Package entry point| Purpose
"@lithiumdevs/ai-inspector"| Core tracing API
"@lithiumdevs/ai-inspector/node"| Node.js preset and local exporter
"@lithiumdevs/ai-inspector/ai-sdk"| Vercel AI SDK integration
"@lithiumdevs/ai-inspector/openai"| OpenAI-compatible client integration
"@lithiumdevs/ai-inspector/otel"| OTLP/HTTP exporter

Command line

The CLI lets you inspect locally recorded traces.

npx ai-inspector list
npx ai-inspector show <trace-id>
npx ai-inspector stats

Repository structure

ai-inspector/
├── packages/
│   └── ai-inspector/   Published npm package
├── src/
│   ├── docs and workbench
│   └── convex/         Backend and trace storage
└── README.md

The repository also includes a web workbench built with Vite, React and Convex.

It provides a dashboard for viewing traces and inspecting individual spans. The playground uses sample scenarios with simulated model responses; it does not make real provider requests.

Development

Requirements:

- Bun
- Node.js 18.17 or newer for the Node package

Install dependencies:

bun install

Run the package checks:

cd packages/ai-inspector
bun run typecheck
bun run test
bun run build

Start the workbench:

bun run dev

The workbench requires a configured Convex deployment. Set "VITE_CONVEX_URL" and configure the required backend environment variables before using authenticated features.

Configuration and documentation

For complete setup instructions, API references, integration examples and publishing instructions, see:

""packages/ai-inspector/README.md"" (packages/ai-inspector/README.md)

Contributing

Contributions, bug reports and feature requests are welcome.

Please read the contribution guidelines before submitting a pull request.

- "Open an issue" (https://github.com/notrealvansh/ai-inspector/issues)
- "View the source" (https://github.com/notrealvansh/ai-inspector)

License

This project is released under the MIT License.
