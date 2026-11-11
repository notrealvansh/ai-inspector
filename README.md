# AI Inspector

Local-first traces for TypeScript AI applications, plus a workbench for reading them.

The package records model calls, prompts and responses, token usage, latency, time to first token, tool calls, errors, estimated costs, and evaluation scores. It writes to a local NDJSON file by default, with optional OpenTelemetry export. No hosted service or API key is required.

Scope: `@lithiumdevs/ai-inspector`. Use this until you claim your own npm scope.

## Repository layout

```
packages/ai-inspector/   publishable package (core, Node, OTLP, AI SDK, OpenAI, CLI)
src/                     docs site and signed-in trace workbench
src/convex/              Convex schema and trace storage
```

The workbench is a Vite, React, and Convex app. It runs sample scenarios through the real inspector core in the browser, then saves the resulting trace for inspection. The sample model responses are simulated and labeled as such in the UI. No provider keys are used for the demo scenarios.

## Package

```bash
cd packages/ai-inspector
bun install
bun run typecheck
bun run test
bun run build
```

Entry points:

- `@lithiumdevs/ai-inspector` core
- `@lithiumdevs/ai-inspector/node` Node preset and JSONL exporter
- `@lithiumdevs/ai-inspector/ai-sdk` Vercel AI SDK wrappers
- `@lithiumdevs/ai-inspector/openai` OpenAI-compatible client proxy
- `@lithiumdevs/ai-inspector/otel` OTLP/HTTP exporter

Full package documentation is in [`packages/ai-inspector/README.md`](packages/ai-inspector/README.md).

## Workbench

Routes:

- `/` landing page and package documentation
- `/auth` email-code and guest sign-in
- `/dashboard` saved trace overview
- `/dashboard/traces` trace list and span inspector
- `/dashboard/playground` sample scenario runner

```bash
bun install
bun run dev
```

Convex types and schema are managed by Convex. After changing `src/convex/`, regenerate types with:

```bash
bun convex dev --once
bun tsc -b --noEmit
```

Authentication uses Convex Auth with email codes and guest sign-in. Email delivery needs `AUTH_EMAIL_GATEWAY_URL` and `AUTH_EMAIL_GATEWAY_KEY` configured on the Convex deployment; the hosted preview supplies equivalent deployment settings. Provider secrets belong in Convex environment variables, not the Vite app.

## Verification

```bash
bun tsc -b --noEmit
bun run inspector:typecheck
bun run inspector:test
```

The package test suite covers trace lifecycles, async context isolation, capture and redaction, pricing, exporter failure handling, evals, AI SDK and OpenAI adapters, streaming, and OTLP mapping.

## Publishing

The npm name in `packages/ai-inspector/package.json` is a placeholder. Replace `@lithiumdevs/ai-inspector` with the name you control, add your `repository`, `homepage`, and `bugs` URLs, then publish from the package directory:

```bash
cd packages/ai-inspector
npm login
npm run typecheck
npm test
npm run build
npm publish --access public
```

For later releases, run `npm version patch` (or `minor`/`major`) before `npm publish`. To deploy the workbench, run `bun run build` and serve the `dist` directory from a static host with `VITE_CONVEX_URL` set to the production Convex URL. Deploy the backend with `bunx convex deploy` and configure its environment variables in the Convex dashboard.

## License

MIT
