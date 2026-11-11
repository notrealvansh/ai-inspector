#!/usr/bin/env node
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { formatCost, formatDuration, formatTrace } from "./exporters/console.js";
import type { TraceData } from "./types.js";
import { VERSION } from "./version.js";

const DEFAULT_FILE = ".ai-inspector/traces.ndjson";

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const command = argv[0] && !argv[0].startsWith("-") ? argv[0] : "help";
  const rest = command === "help" ? argv : argv.slice(1);
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument.startsWith("--")) {
      const [rawName, inlineValue] = argument.slice(2).split("=", 2);
      if (inlineValue !== undefined) {
        flags[rawName] = inlineValue;
      } else if (rest[index + 1] && !rest[index + 1].startsWith("-")) {
        flags[rawName] = rest[index + 1];
        index += 1;
      } else {
        flags[rawName] = true;
      }
    } else {
      positional.push(argument);
    }
  }

  return { command, positional, flags };
}

function fileFrom(flags: Record<string, string | boolean>): string {
  const flag = typeof flags.file === "string" ? flags.file : undefined;
  return resolve(process.cwd(), flag ?? process.env.AI_INSPECTOR_FILE ?? DEFAULT_FILE);
}

function isTrace(value: unknown): value is TraceData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { id?: unknown; name?: unknown; spans?: unknown };
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    Array.isArray(candidate.spans)
  );
}

export function parseTraceLines(content: string): {
  traces: TraceData[];
  invalid: number;
} {
  const traces: TraceData[] = [];
  let invalid = 0;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isTrace(parsed)) traces.push(parsed);
      else invalid += 1;
    } catch {
      invalid += 1;
    }
  }
  return { traces, invalid };
}

async function readTraces(file: string): Promise<TraceData[]> {
  let content: string;
  try {
    content = await readFile(file, "utf8");
  } catch {
    throw new Error(
      `No trace file at ${file}. Run an instrumented app first, or pass --file.`,
    );
  }
  const { traces, invalid } = parseTraceLines(content);
  if (invalid > 0) {
    console.error(`Skipped ${invalid} malformed line${invalid === 1 ? "" : "s"}.`);
  }
  return traces;
}

function formatStarted(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19);
}

function tokenSummary(trace: TraceData): string {
  const input = trace.usage?.inputTokens;
  const output = trace.usage?.outputTokens;
  if (input === undefined && output === undefined) return "-";
  return `${input ?? "?"} in / ${output ?? "?"} out`;
}

function truncate(value: string, length: number): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

export function formatTraceList(traces: TraceData[]): string {
  if (traces.length === 0) return "No traces found.";
  const rows = traces.map((trace) => [
    trace.id.slice(0, 8),
    formatStarted(trace.startedAt),
    truncate(trace.name, 30),
    String(trace.spans.length),
    formatDuration(trace.durationMs),
    tokenSummary(trace),
    formatCost(trace.cost?.totalUsd) || "-",
    trace.status,
  ]);
  const headers = ["ID", "STARTED", "NAME", "SPANS", "DURATION", "TOKENS", "COST", "STATUS"];
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index].length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, index) => (index === cells.length - 1 ? cell : cell.padEnd(widths[index])))
      .join("  ")
      .trimEnd();
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(
    "\n",
  );
}

function percentile(values: number[], ratio: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

export function formatStats(traces: TraceData[]): string {
  if (traces.length === 0) return "No traces found.";
  const errors = traces.filter((trace) => trace.status === "error").length;
  const duration = percentile(
    traces.map((trace) => trace.durationMs ?? 0),
    0.5,
  );
  const p95 = percentile(
    traces.map((trace) => trace.durationMs ?? 0),
    0.95,
  );
  const spans = traces.reduce((total, trace) => total + trace.spans.length, 0);
  const inputTokens = traces.reduce(
    (total, trace) => total + (trace.usage?.inputTokens ?? 0),
    0,
  );
  const outputTokens = traces.reduce(
    (total, trace) => total + (trace.usage?.outputTokens ?? 0),
    0,
  );
  const cost = traces.reduce((total, trace) => total + (trace.cost?.totalUsd ?? 0), 0);
  const lines = [
    `traces      ${traces.length}`,
    `errors      ${errors} (${((errors / traces.length) * 100).toFixed(1)}%)`,
    `spans       ${spans}`,
    `tokens      ${inputTokens} in / ${outputTokens} out`,
    `cost        ${cost > 0 ? formatCost(cost) : "-"}`,
    `duration    p50 ${formatDuration(duration)} · p95 ${formatDuration(p95)}`,
  ];
  return lines.join("\n");
}

function showTrace(trace: TraceData, json: boolean): string {
  if (json) return JSON.stringify(trace, null, 2);
  const lines = [
    ...formatTrace(trace),
    "",
    `id        ${trace.id}`,
    `started   ${formatStarted(trace.startedAt)}`,
    `status    ${trace.status}`,
    ...(trace.tags.length > 0 ? [`tags      ${trace.tags.join(", ")}`] : []),
    "",
  ];
  for (const span of trace.spans) {
    lines.push(
      `${span.id.slice(0, 12)}  ${span.kind.padEnd(10)} ${span.name}  ${formatDuration(span.durationMs)}`,
    );
    if (span.model) lines.push(`  model     ${span.provider ? `${span.provider}/` : ""}${span.model}`);
    if (span.usage) {
      lines.push(`  tokens    ${tokenSummary({ ...trace, usage: span.usage })}`);
    }
    if (span.input !== undefined) {
      lines.push(`  input     ${JSON.stringify(span.input)}`);
    }
    if (span.output !== undefined) {
      lines.push(`  output    ${JSON.stringify(span.output)}`);
    }
    if (span.error) lines.push(`  error     ${span.error.message}`);
    lines.push("");
  }
  return lines.join("\n");
}

function help(): string {
  return [
    "ai-inspector — inspect local traces",
    "",
    "Usage",
    "  ai-inspector list [--file path] [--limit n]",
    "  ai-inspector show <id|last> [--file path] [--json]",
    "  ai-inspector stats [--file path]",
    "  ai-inspector clear [--file path] --yes",
    "  ai-inspector help",
    "",
    `Default file: ${DEFAULT_FILE} (or AI_INSPECTOR_FILE)`,
  ].join("\n");
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.flags.version || parsed.command === "version") {
    console.log(VERSION);
    return;
  }
  if (parsed.command === "help" || parsed.flags.help) {
    console.log(help());
    return;
  }

  const file = fileFrom(parsed.flags);
  if (parsed.command === "clear") {
    if (!parsed.flags.yes) {
      console.error(`Refusing to delete ${file} without --yes.`);
      process.exitCode = 1;
      return;
    }
    await rm(file, { force: true });
    console.log(`Removed ${file}.`);
    return;
  }

  const traces = await readTraces(file).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return undefined;
  });
  if (!traces) return;

  if (parsed.command === "list") {
    const limitValue =
      typeof parsed.flags.limit === "string" ? Number.parseInt(parsed.flags.limit, 10) : 20;
    const limit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 20;
    console.log(formatTraceList(traces.slice(-limit)));
    return;
  }

  if (parsed.command === "show") {
    const selector = parsed.positional[0] ?? "last";
    const trace =
      selector === "last"
        ? traces[traces.length - 1]
        : traces.find((candidate) => candidate.id.startsWith(selector));
    if (!trace) {
      console.error(`No trace matches "${selector}".`);
      process.exitCode = 1;
      return;
    }
    console.log(showTrace(trace, parsed.flags.json === true));
    return;
  }

  if (parsed.command === "stats") {
    console.log(formatStats(traces));
    return;
  }

  console.log(help());
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
