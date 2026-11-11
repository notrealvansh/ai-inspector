## AI Inspector

AI observability for TypeScript applications. Trace LLM calls, tokens,
latency, tool executions, errors, and evaluations — without requiring a
hosted dashboard.
AI Inspector is a TypeScript toolkit for observing, debugging, and
evaluating AI application workflows. It helps developers understand what
happened during an AI run by recording traces, model-call metadata,
token usage, latency, tool activity, errors, and evaluation results.

It is designed to work locally without making a hosted observability
service mandatory.

## Features

-   Trace AI workflows — organize related operations into traces and
    spans.
-   Record model activity — capture model names, timing, token usage,
    and call metadata when supplied by an integration.
-   Inspect tool executions — record tool activity and its outcomes.
-   Track errors — keep error information alongside the relevant trace.
-   Run evaluations — use deterministic scorers to evaluate recorded
    outputs.
-   Protect sensitive data — configure redaction and sampling.
-   Local-first storage — the Node preset can write trace data to a
    local NDJSON file.
-   Multiple integration paths — use the core API, Node helpers,
    OpenAI-compatible integration, AI SDK integration, or OpenTelemetry
    support.
-   CLI inspection — inspect recorded traces from the terminal.

## Requirements

-   Node.js >=18.17
-   TypeScript projects are supported.
-   Use a compatible version of the provider or SDK you are integrating
    with.

Installation

    npm install @lithiumdevs/ai-inspector

Or use another package manager:

    pnpm add @lithiumdevs/ai-inspector

    bun add @lithiumdevs/ai-inspector

## Quick Start

The following example creates an inspector and records a sample trace.

    import { createNodeInspector } from "@lithiumdevs/ai-inspector/node";

    const inspector = createNodeInspector({
      // Configure the local output path using the options supported
      // by your installed package version.
    });

    const trace = inspector.startTrace({
      name: "example-ai-workflow",
    });

    const span = trace.startSpan({
      name: "sample-operation",
      type: "custom",
    });

    span.setAttribute("example", true);
    span.end();

    trace.end();

    await inspector.flush();

This is an instrumentation example using sample data. It does not make a
real request to an AI provider. To observe real model calls, connect the
relevant integration and instrument the provider or SDK calls in your
application.

  API option names can vary by package version. Check the package
  documentation and TypeScript definitions for the exact configuration
  supported by the version you have installed.

## Integrations

AI Inspector provides separate entry points for different integration
needs.

  -----------------------------------------------------------------------
  Entry point                         Purpose
  ----------------------------------- -----------------------------------
  @lithiumdevs/ai-inspector           Core tracing and inspection APIs

  @lithiumdevs/ai-inspector/node      Node.js helpers and local trace
                                      output

  @lithiumdevs/ai-inspector/openai    OpenAI-compatible integration

  @lithiumdevs/ai-inspector/ai-sdk    Vercel AI SDK integration

  @lithiumdevs/ai-inspector/otel      OpenTelemetry support
  -----------------------------------------------------------------------

Core API

Use the core API when you want to add tracing to your own application
code or build a custom integration.

Node.js

Use the Node entry point for Node.js applications and local development
workflows. The Node preset supports writing trace records locally in
NDJSON format.

OpenAI-compatible clients

Use the OpenAI integration entry point when working with a supported
OpenAI-compatible client. Check the package documentation for setup
details and compatibility requirements.

Vercel AI SDK

Use the AI SDK integration entry point to instrument supported Vercel AI
SDK workflows. Refer to the package documentation for the exact adapter
setup for your SDK version.

OpenTelemetry

Use the OpenTelemetry entry point when connecting AI Inspector with an
OpenTelemetry-based observability workflow. Review the package
documentation for supported exporter and transport configuration.

Command-Line Interface

AI Inspector includes a CLI for inspecting locally recorded traces.

    npx @lithiumdevs/ai-inspector list

Show a trace:

    npx @lithiumdevs/ai-inspector show <trace-id>

View summary statistics:

    npx @lithiumdevs/ai-inspector stats

You can also invoke the CLI through your package manager’s equivalent
command runner.

The CLI can only inspect trace data that is available in the configured
local data source. If no traces have been recorded yet, the results may
be empty.

Web Workbench

The repository also contains a web workbench for exploring the project.

The current workbench includes a playground experience with simulated
model responses. Treat playground output as demonstration data; it
should not be interpreted as a live response from an external AI
provider unless a real provider integration has been configured.

Development

## Clone the repository:

    git clone https://github.com/notrealvansh/ai-inspector.git
    cd ai-inspector

Install dependencies using the package manager configured for the
repository:

    bun install

Common development checks:

    bun run typecheck
    bun run test
    bun run build

Run the commands supported by the scripts in the relevant workspace’s
package.json. If a script is not available at the repository root, run
the corresponding command from the package workspace.

## Repository Structure

The repository is organized as a TypeScript project with the package
implementation and supporting workbench.

    ai-inspector/
    ├── packages/
    │   └── ai-inspector/
    │       ├── src/
    │       ├── package.json
    │       └── README.md
    ├── .github/
    ├── package.json
    └── README.md

The exact source layout may evolve as the project develops.

## Privacy

AI Inspector is designed to support local-first observability workflows.
The Node preset can write trace records to local NDJSON output.

Your application is responsible for deciding what data is collected and
where it is sent. Avoid recording passwords, API keys, access tokens,
personal data, or other sensitive information. Configure redaction and
sampling appropriately before using the package with real application
traffic.

Do not assume that every integration stores data in the same place.
Review the configuration for the specific integration you use.

## Contributing

Contributions, bug reports, and suggestions are welcome.

Before submitting a change:

1.  Check existing issues to avoid duplicates.
2.  Describe the problem or proposed improvement clearly.
3.  Include steps to reproduce bugs where possible.
4.  Run the relevant tests and type checks.
5.  Open a pull request with a concise description of the change.

Project guidance:

-   Contributing Guide
-   Code of Conduct
-   Security Policy

If one of these files is not present in the repository, follow the
instructions in the repository’s available contribution and security
documentation.

## Links

-   npm package: https://www.npmjs.com/package/@lithiumdevs/ai-inspector
-   GitHub repository: https://github.com/notrealvansh/ai-inspector
-   Issue tracker: https://github.com/notrealvansh/ai-inspector/issues

## License

This project is released under the MIT License. See the LICENSE file for
details.
