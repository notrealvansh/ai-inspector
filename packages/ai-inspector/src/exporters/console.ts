import type { Exporter, SpanData, TraceData } from "../types.js";

export interface ConsoleExporterOptions {
  /** Defaults to true. */
  enabled?: boolean;
  /** ANSI colors. Defaults to true when the output looks like a terminal. */
  colors?: boolean;
  log?: (line: string) => void;
}

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  yellow: "\u001b[33m",
  cyan: "\u001b[36m",
  bold: "\u001b[1m",
};

function detectColors(): boolean {
  if (typeof process !== "undefined" && process.env?.NO_COLOR) return false;
  const stream = typeof process !== "undefined" ? process.stdout : undefined;
  return Boolean(stream?.isTTY);
}

function paint(value: string, color: keyof typeof ANSI, colors: boolean): string {
  return colors ? `${ANSI[color]}${value}${ANSI.reset}` : value;
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return "-";
  if (ms < 1) return "<1ms";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

export function formatCost(totalUsd: number | undefined): string {
  if (totalUsd === undefined) return "";
  if (totalUsd === 0) return "$0";
  if (totalUsd < 0.000001) return "<$0.000001";
  return `$${totalUsd.toFixed(totalUsd < 0.01 ? 6 : 4)}`;
}

function formatTokens(count: number): string {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(1)}m`;
}

function spanSummary(span: SpanData, colors: boolean): string {
  const parts = [`${span.kind}`];
  if (span.kind === "generation" || span.kind === "embedding") {
    if (span.model) parts.push(span.model);
  }
  if (span.usage?.inputTokens !== undefined) {
    parts.push(`in ${formatTokens(span.usage.inputTokens)}`);
  }
  if (span.usage?.outputTokens !== undefined) {
    parts.push(`out ${formatTokens(span.usage.outputTokens)}`);
  }
  if (span.timeToFirstTokenMs !== undefined) {
    parts.push(`ttft ${formatDuration(span.timeToFirstTokenMs)}`);
  }
  if (span.cost?.totalUsd !== undefined) {
    parts.push(formatCost(span.cost.totalUsd));
  }
  if (span.status === "error") parts.push("error");
  if (span.status === "unfinished") parts.push("unfinished");

  const label = span.status === "error" ? paint("error", "red", colors) : span.status === "unfinished" ? paint("unfinished", "yellow", colors) : "";
  return `${paint(`[${parts.join(" · ")}]`, "dim", colors)}${label ? ` ${label}` : ""}`;
}

export function formatTrace(trace: TraceData, options: { colors?: boolean } = {}): string[] {
  const colors = options.colors ?? false;
  const status =
    trace.status === "error"
      ? paint("error", "red", colors)
      : paint("ok", "green", colors);
  const headerParts = [
    paint(trace.name, "bold", colors),
    formatDuration(trace.durationMs),
    status,
  ];
  if (trace.usage?.inputTokens !== undefined || trace.usage?.outputTokens !== undefined) {
    headerParts.push(
      `${trace.usage.inputTokens !== undefined ? `in ${formatTokens(trace.usage.inputTokens)}` : ""}${
        trace.usage.inputTokens !== undefined && trace.usage.outputTokens !== undefined ? " · " : ""
      }${trace.usage.outputTokens !== undefined ? `out ${formatTokens(trace.usage.outputTokens)}` : ""}`,
    );
  }
  if (trace.cost) headerParts.push(formatCost(trace.cost.totalUsd));

  const lines = [`${paint("[trace]", "cyan", colors)} ${headerParts.join("  ")}`];

  trace.spans.forEach((span, index) => {
    const last = index === trace.spans.length - 1;
    const branch = last ? "└─" : "├─";
    lines.push(`   ${paint(branch, "dim", colors)} ${span.name}  ${spanSummary(span, colors)}  ${formatDuration(span.durationMs)}`);
    if (span.toolCalls?.length) {
      const indent = last ? "      " : "   │  ";
      span.toolCalls.forEach((tool, toolIndex) => {
        const marker = toolIndex === span.toolCalls!.length - 1 ? "└" : "├";
        lines.push(
          `${indent}${paint(`${marker} tool`, "dim", colors)} ${tool.name} ${formatDuration(tool.durationMs)}${tool.error ? paint(" failed", "red", colors) : ""}`,
        );
      });
    }
    if (span.error) {
      const indent = last ? "      " : "   │  ";
      lines.push(`${indent}${paint(span.error.message, "red", colors)}`);
    }
  });

  if (trace.error) {
    lines.push(`   ${paint(trace.error.message, "red", colors)}`);
  }
  return lines;
}

export class ConsoleExporter implements Exporter {
  readonly name = "console";
  private readonly enabled: boolean;
  private readonly colors: boolean;
  private readonly log: (line: string) => void;

  constructor(options: ConsoleExporterOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.colors = options.colors ?? detectColors();
    this.log = options.log ?? ((line) => console.log(line));
  }

  exportTrace(trace: TraceData): void {
    if (!this.enabled) return;
    for (const line of formatTrace(trace, { colors: this.colors })) {
      this.log(line);
    }
  }
}

export function consoleExporter(options: ConsoleExporterOptions = {}): ConsoleExporter {
  return new ConsoleExporter(options);
}
