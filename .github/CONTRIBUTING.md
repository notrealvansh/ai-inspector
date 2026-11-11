# Contributing

Thanks for your interest in this project.

## How to contribute

- Open an issue before starting a large change so the approach can be discussed.
- Keep pull requests focused. Small, reviewable PRs are preferred.
- Add or update tests for behavior changes.
- Keep TypeScript strict mode clean. The package is developed with `strict: true`.

## Development workflow

```bash
cd packages/ai-inspector
bun install
bun run typecheck
bun run test
bun run build
```

`prepublishOnly` runs `npm run build && npm test`. That is the same gate used before a release.

## Compatibility

The package targets Node 18.17 or newer for the Node entry point. The core also runs in browsers and edge runtimes.

## Code style

- Use explicit types where they improve readability.
- Avoid accidental peer dependencies. The published package should have no runtime dependencies outside Node itself.
- Prefer local-first behavior unless an exporter is explicitly configured.

## Reporting issues

Include the package version, Node version if relevant, and a minimal reproducible example. For adapter issues, include whether the problem is with OpenAI, Vercel AI SDK, streaming, embeddings, or instrumentation in general.
