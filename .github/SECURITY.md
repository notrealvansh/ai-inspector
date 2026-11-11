# Security Policy

## Supported versions

Only the latest released version is actively supported.

## Reporting a vulnerability

Please report security issues privately rather than opening a public issue.

If an issue is sensitive and you are comfortable with it, open a private issue in the repository or contact the maintainers directly with details. Please include:

- The affected version
- A description of the vulnerability
- Steps to reproduce, if possible
- Any potential impact you are aware of

We will follow up and coordinate a fix and disclosure timeline where appropriate.

## What we try to protect

This package is designed for local-first observability. By default:

- Traces are stored locally and are not sent anywhere automatically.
- Capture mode defaults to `preview`, with prompt and response truncation and secret-key redaction.
- No API keys are logged.
- No global patching of `fetch` or provider clients occurs.
- The OpenTelemetry exporter sends traces only when explicitly configured.

If you find a path that could expose credentials, leak prompts, or trigger unintended network requests, please report it responsibly.
