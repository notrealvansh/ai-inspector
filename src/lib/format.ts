import { formatDistanceToNowStrict } from "date-fns";

import type { SpanData, SpanKind, TraceData } from "@/lib/inspector";

export function formatTokens(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1_000) return String(value);
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

export function formatCostUsd(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value === 0) return "$0";
  if (value < 0.000001) return "<$0.000001";
  return `$${value.toFixed(value < 0.01 ? 5 : 3)}`;
}

export function formatMilliseconds(value: number | undefined): string {
  if (value === undefined) return "—";
  if (value < 1) return "<1 ms";
  if (value < 1_000) return `${Math.round(value)} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

export function formatStartedAt(value: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatRelativeTime(value: number): string {
  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function shortId(value: string): string {
  return value.slice(0, 8);
}

export function parseTraceData(data: string | undefined): TraceData | null {
  if (!data) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<TraceData>;
    if (!Array.isArray(candidate.spans) || typeof candidate.name !== "string") {
      return null;
    }
    return candidate as TraceData;
  } catch {
    return null;
  }
}

export const SPAN_KIND_TONE: Record<
  SpanKind,
  { bar: string; badge: string; dot: string; label: string }
> = {
  generation: {
    bar: "bg-primary",
    badge: "border-primary/25 bg-primary/10 text-primary",
    dot: "bg-primary",
    label: "generation",
  },
  embedding: {
    bar: "bg-sky-400",
    badge: "border-sky-400/25 bg-sky-400/10 text-sky-300",
    dot: "bg-sky-400",
    label: "embedding",
  },
  rerank: {
    bar: "bg-orange-400",
    badge: "border-orange-400/25 bg-orange-400/10 text-orange-300",
    dot: "bg-orange-400",
    label: "rerank",
  },
  retrieval: {
    bar: "bg-cyan-400",
    badge: "border-cyan-400/25 bg-cyan-400/10 text-cyan-300",
    dot: "bg-cyan-400",
    label: "retrieval",
  },
  tool: {
    bar: "bg-amber-400",
    badge: "border-amber-400/25 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
    label: "tool",
  },
  agent: {
    bar: "bg-emerald-400",
    badge: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
    label: "agent",
  },
  evaluation: {
    bar: "bg-rose-400",
    badge: "border-rose-400/25 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
    label: "evaluation",
  },
  custom: {
    bar: "bg-muted-foreground",
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground",
    label: "custom",
  },
};

export interface SpanRow {
  span: SpanData;
  depth: number;
}

export function buildSpanRows(spans: SpanData[]): SpanRow[] {
  const ids = new Set(spans.map((span) => span.id));
  const groups = new Map<string, SpanData[]>();

  for (const span of spans) {
    const parent =
      span.parentId && ids.has(span.parentId) ? span.parentId : "__root__";
    const siblings = groups.get(parent) ?? [];
    siblings.push(span);
    groups.set(parent, siblings);
  }

  const rows: SpanRow[] = [];
  const seen = new Set<string>();

  function visit(parent: string, depth: number) {
    const siblings = (groups.get(parent) ?? []).sort(
      (left, right) => left.startedAt - right.startedAt,
    );
    for (const span of siblings) {
      if (seen.has(span.id)) continue;
      seen.add(span.id);
      rows.push({ span, depth });
      visit(span.id, depth + 1);
    }
  }

  visit("__root__", 0);

  for (const span of spans) {
    if (!seen.has(span.id)) rows.push({ span, depth: 0 });
  }

  return rows;
}

export function spanPosition(
  trace: TraceData,
  span: SpanData,
): { left: number; width: number } {
  const total = Math.max(trace.durationMs ?? 0, 1);
  const start = Math.max(0, span.startedAt - trace.startedAt);
  const duration = Math.max(0, span.durationMs ?? 0);
  const left = Math.min(100, (start / total) * 100);
  const width = Math.max(1.4, Math.min(100 - left, (duration / total) * 100));
  return { left, width };
}

export function traceStatusTone(status: string): string {
  if (status === "error") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "unfinished" || status === "running") {
    return "border-amber-400/30 bg-amber-400/10 text-amber-300";
  }
  return "border-primary/25 bg-primary/10 text-primary";
}

export function prettyJson(value: unknown): string {
  if (value === undefined) return "No data recorded.";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
