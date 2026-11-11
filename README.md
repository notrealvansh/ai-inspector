AI Inspector

<p align="center">
  <strong>Local-first observability for TypeScript AI applications.</strong>
</p><p align="center">
  Inspect LLM calls, token usage, latency, tool executions and evaluations — without mandatory cloud infrastructure.
</p><p align="center">
  <a href="https://www.npmjs.com/package/@lithiumdevs/ai-inspector">
    <img src="https://img.shields.io/npm/v/@lithiumdevs/ai-inspector" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/@lithiumdevs/ai-inspector">
    <img src="https://img.shields.io/npm/dm/@lithiumdevs/ai-inspector" alt="npm downloads">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-supported-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</p>---

Overview

AI Inspector is a lightweight observability toolkit designed for TypeScript AI applications.

It helps developers understand what happens inside their AI systems by recording model calls, prompts, responses, token usage, execution time, tool calls and errors.

By default, traces are stored locally in NDJSON format. OpenTelemetry export is available for applications that need external observability infrastructure.

No hosted account is required to get started.

Features

Feature| Description
Request tracing| Record model calls, prompts and responses
Token tracking| Capture input and output token usage
Latency monitoring| Measure execution time and time to first token
Tool tracking| Inspect tool executions and results
Error tracking| Record failures and execution errors
Cost estimation| Estimate costs using configured model pricing
Evaluations| Run scorers and record evaluation results
Local storage| Store traces locally in NDJSON format
OpenTelemetry| Export traces through OTLP/HTTP
Data controls| Configure redaction, sampling and captured fields

Installation

npm install @lithiumdevs/ai-inspector

Quick Start

Create an inspector and record your first trace.

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

This example uses sample data to demonstrate trace creation. It does not make a real model request.

For real provider requests, use one of the available integrations.

Integrations

AI Inspector provides separate entry points for different environments and integrations.

Package| Purpose
"@lithiumdevs/ai-inspector"| Core tracing API
"@lithiumdevs/ai-inspector/node"| Node.js preset and local exporter
"@lithiumdevs/ai-inspector/ai-sdk"| Vercel AI SDK integration
"@lithiumdevs/ai-inspector/openai"| OpenAI-compatible client integration
"@lithiumdevs/ai-inspector/otel"| OTLP/HTTP exporter

See the "complete package documentation" (packages/ai-inspector/README.md) for integration setup and API details.

Command Line Interface

Inspect locally recorded traces using the AI Inspector CLI.

npx ai-inspector list
npx ai-inspector show <trace-id>
npx ai-inspector stats

Web Workbench

The repository also includes a web workbench built with:

- React
- Vite
- TypeScript
- Convex

It provides an interface for browsing traces and inspecting individual spans.

Note: The playground currently uses simulated model responses. It does not make real provider requests.

Development

Requirements

- Bun
- Node.js 18.17 or newer for the Node.js package

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

The workbench requires a configured Convex deployment.

Configure "VITE_CONVEX_URL" and the required backend environment variables before using deployment-backed features.

Keep private API keys in backend environment variables. Never expose them through frontend Vite variables.

Repository Structure

ai-inspector/
├── .github/
├── packages/
│   └── ai-inspector/
├── public/
├── src/
│   └── convex/
├── README.md
└── package.json

Contributing

Contributions, bug reports and feature requests are welcome.

Please read the "contribution guidelines" (.github/CONTRIBUTING.md) before submitting a pull request.

- "Report an issue" (https://github.com/notrealvansh/ai-inspector/issues)
- "View source code" (https://github.com/notrealvansh/ai-inspector)
- "Security policy" (.github/SECURITY.md)
- "Code of conduct" (.github/CODE_OF_CONDUCT.md)

License

Released under the MIT License.
