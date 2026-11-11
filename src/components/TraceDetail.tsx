import { useEffect, useMemo, useState } from "react";
import { Copy, CornerDownRight, Timer, Wrench } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SPAN_KIND_TONE,
  buildSpanRows,
  formatCostUsd,
  formatMilliseconds,
  formatStartedAt,
  formatTokens,
  prettyJson,
  spanPosition,
  traceStatusTone,
} from "@/lib/format";
import type { SpanData, TraceData } from "@/lib/inspector";
import { cn } from "@/lib/utils";

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-[70px]">
      <p className="mono-label text-[9px]">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xs",
          accent ? "text-primary" : "text-foreground/85",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 font-mono text-[10px]",
        traceStatusTone(status),
      )}
    >
      {status}
    </span>
  );
}

function Payload({ value }: { value: unknown }) {
  return (
    <pre className="max-h-[340px] overflow-auto rounded-md border border-border bg-background/60 p-3 font-mono text-[11px] leading-6 text-foreground/75">
      {prettyJson(value)}
    </pre>
  );
}

function SpanInspector({
  trace,
  span,
}: {
  trace: TraceData;
  span: SpanData | null;
}) {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    setTab("overview");
  }, [span?.id]);

  if (!span) {
    return (
      <div className="space-y-4">
        <div>
          <p className="mono-label">Selected</p>
          <h3 className="mt-1.5 text-sm font-medium">Trace root</h3>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {trace.id}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-y border-border py-4">
          <Metric label="duration" value={formatMilliseconds(trace.durationMs)} />
          <Metric label="spans" value={String(trace.spans.length)} />
          <Metric
            label="tokens"
            value={`${formatTokens(trace.usage?.inputTokens)} in / ${formatTokens(trace.usage?.outputTokens)} out`}
          />
          <Metric
            label="est. cost"
            value={formatCostUsd(trace.cost?.totalUsd)}
            accent
          />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="input">Input</TabsTrigger>
            <TabsTrigger value="output">Output</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-3 space-y-3">
            <div>
              <p className="mono-label">tags</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {trace.tags.length > 0 ? (
                  trace.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>
            </div>
            <div>
              <p className="mono-label">metadata</p>
              <div className="mt-2">
                <Payload value={trace.metadata} />
              </div>
            </div>
            {trace.error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                <p className="mono-label text-destructive">error</p>
                <p className="mt-1.5 font-mono text-[11px] leading-5 text-destructive">
                  {trace.error.message}
                </p>
              </div>
            ) : null}
          </TabsContent>
          <TabsContent value="input" className="mt-3">
            <Payload value={trace.input} />
          </TabsContent>
          <TabsContent value="output" className="mt-3">
            <Payload value={trace.output} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  const tone = SPAN_KIND_TONE[span.kind];
  const toolCalls = span.toolCalls ?? [];
  const evaluations = span.evaluations ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className={cn(
              "inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px]",
              tone.badge,
            )}
          >
            {tone.label}
          </span>
          <h3 className="mt-2 text-sm font-medium leading-5">{span.name}</h3>
          <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
            {span.id}
          </p>
        </div>
        <StatusBadge status={span.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 border-y border-border py-4">
        <Metric label="duration" value={formatMilliseconds(span.durationMs)} />
        <Metric
          label="tokens"
          value={`${formatTokens(span.usage?.inputTokens)} in / ${formatTokens(span.usage?.outputTokens)} out`}
        />
        <Metric label="est. cost" value={formatCostUsd(span.cost?.totalUsd)} accent />
        <Metric
          label="ttft"
          value={
            span.timeToFirstTokenMs !== undefined
              ? formatMilliseconds(span.timeToFirstTokenMs)
              : "—"
          }
        />
      </div>

      <div className="space-y-1.5 font-mono text-[10.5px]">
        {span.model ? (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">model</span>
            <span className="truncate text-foreground/80">{span.model}</span>
          </div>
        ) : null}
        {span.provider ? (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">provider</span>
            <span className="text-foreground/80">{span.provider}</span>
          </div>
        ) : null}
        {span.operation ? (
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">operation</span>
            <span className="text-foreground/80">{span.operation}</span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">started</span>
          <span className="text-foreground/80">{formatStartedAt(span.startedAt)}</span>
        </div>
      </div>

      {span.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
          <p className="mono-label text-destructive">error</p>
          <p className="mt-1.5 font-mono text-[11px] leading-5 text-destructive">
            {span.error.message}
          </p>
        </div>
      ) : null}

      {evaluations.length > 0 ? (
        <div className="space-y-2">
          <p className="mono-label">scores</p>
          {evaluations.map((score) => (
            <div key={score.scorer} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px]">{score.scorer}</span>
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    score.passed ? "text-primary" : "text-destructive",
                  )}
                >
                  {score.score.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-sm bg-muted">
                <div
                  className={cn(
                    "h-full",
                    score.passed ? "bg-primary" : "bg-destructive",
                  )}
                  style={{ width: `${Math.round(score.score * 100)}%` }}
                />
              </div>
              {score.reason ? (
                <p className="mt-2 text-[10.5px] leading-5 text-muted-foreground">
                  {score.reason}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {toolCalls.length > 0 ? (
        <div className="space-y-2">
          <p className="mono-label">tool calls</p>
          {toolCalls.map((tool, index) => (
            <div
              key={`${tool.id ?? tool.name}-${index}`}
              className="rounded-md border border-border p-2.5"
            >
              <div className="flex items-center gap-1.5 font-mono text-[10.5px]">
                <Wrench className="size-3 text-amber-400" />
                {tool.name}
                {tool.error ? (
                  <span className="text-destructive">· failed</span>
                ) : null}
              </div>
              {tool.input !== undefined ? (
                <pre className="mt-2 max-h-24 overflow-auto font-mono text-[10px] leading-5 text-muted-foreground">
                  {prettyJson(tool.input)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {span.events.length > 0 ? (
        <div className="space-y-1.5">
          <p className="mono-label">events</p>
          {span.events.map((event, index) => (
            <div
              key={`${event.name}-${index}`}
              className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground"
            >
              <CornerDownRight className="size-3 text-primary/60" />
              <span className="text-foreground/75">{event.name}</span>
              <span>{formatMilliseconds(event.at - span.startedAt)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-3">
          <Payload value={span.attributes} />
        </TabsContent>
        <TabsContent value="input" className="mt-3">
          <Payload value={span.input} />
        </TabsContent>
        <TabsContent value="output" className="mt-3">
          <Payload value={span.output} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TraceDetail({ trace }: { trace: TraceData }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = useMemo(() => buildSpanRows(trace.spans), [trace.spans]);
  const selected = rows.find((row) => row.span.id === selectedId)?.span ?? null;

  useEffect(() => {
    setSelectedId(null);
  }, [trace.id]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={trace.status} />
            <span className="font-mono text-[10px] text-muted-foreground">
              {trace.spans.length} spans
            </span>
            {trace.tags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
          <h2 className="mt-3 text-xl font-bold tracking-tight">{trace.name}</h2>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
            {trace.id} · {formatStartedAt(trace.startedAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Metric label="duration" value={formatMilliseconds(trace.durationMs)} />
          <Metric
            label="tokens"
            value={`${formatTokens(trace.usage?.inputTokens)} / ${formatTokens(trace.usage?.outputTokens)}`}
          />
          <Metric label="est. cost" value={formatCostUsd(trace.cost?.totalUsd)} accent />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              navigator.clipboard
                .writeText(JSON.stringify(trace, null, 2))
                .then(() => toast("Trace JSON copied"))
                .catch(() => toast.error("Could not copy the trace"));
            }}
          >
            <Copy className="size-3.5" />
            Copy JSON
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Timer className="size-3.5 text-primary" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                Waterfall
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground">
              {formatMilliseconds(trace.durationMs)}
            </span>
          </div>

          <div className="divide-y divide-border/60">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.025]",
                selectedId === null && "bg-primary/[0.05]",
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[11px] text-foreground/90">
                    {trace.name}
                  </span>
                  <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">
                    {formatMilliseconds(trace.durationMs)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-white/[0.04]">
                  <div className="h-full w-full rounded-sm bg-primary/25" />
                </div>
              </div>
            </button>

            {rows.map(({ span, depth }) => {
              const tone = SPAN_KIND_TONE[span.kind];
              const position = spanPosition(trace, span);
              return (
                <button
                  key={span.id}
                  type="button"
                  onClick={() => setSelectedId(span.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/[0.025]",
                    selectedId === span.id && "bg-primary/[0.05]",
                  )}
                >
                  <span
                    className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
                    aria-hidden="true"
                  />
                  <div
                    className="min-w-0 flex-1"
                    style={{ paddingLeft: `${Math.min(depth, 4) * 12}px` }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={cn(
                          "truncate font-mono text-[11px]",
                          span.status === "error"
                            ? "text-destructive"
                            : "text-foreground/85",
                        )}
                      >
                        {span.name}
                      </span>
                      <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">
                        {formatMilliseconds(span.durationMs)}
                      </span>
                    </div>
                    <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-sm bg-white/[0.04]">
                      <div
                        className={cn("absolute h-full rounded-sm", tone.bar)}
                        style={{
                          left: `${position.left}%`,
                          width: `${position.width}%`,
                          opacity: span.kind === "agent" ? 0.45 : 1,
                        }}
                      />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
                        {span.kind}
                        {span.model ? ` · ${span.model}` : ""}
                      </span>
                      {span.timeToFirstTokenMs !== undefined ? (
                        <span className="font-mono text-[9px] text-primary/70">
                          ttft {formatMilliseconds(span.timeToFirstTokenMs)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <SpanInspector trace={trace} span={selected} />
        </div>
      </div>
    </div>
  );
}
