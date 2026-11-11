import { ArrowRight, ChevronRight, FlaskConical, Loader2, Terminal } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { TraceSummary } from "@/lib/convex-types";
import {
  formatCostUsd,
  formatMilliseconds,
  formatRelativeTime,
  formatTokens,
  traceStatusTone,
} from "@/lib/format";
import { cn } from "@/lib/utils";

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mono-label">{label}</p>
      <p
        className={cn(
          "mt-3 font-mono text-2xl tracking-tight",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function TraceRow({ trace }: { trace: TraceSummary }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/dashboard/traces?trace=${trace.id}`)}
      className="group flex w-full items-center gap-3 border-b border-border/60 px-1 py-3 text-left last:border-0"
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          trace.status === "error" ? "bg-destructive" : "bg-primary",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{trace.name}</p>
        <p className="mt-0.5 truncate font-mono text-[9.5px] text-muted-foreground">
          {trace.scenario} · {formatRelativeTime(trace.startedAt)}
        </p>
      </div>
      <div className="hidden items-center gap-6 font-mono text-[10px] text-muted-foreground sm:flex">
        <span>{formatMilliseconds(trace.durationMs)}</span>
        <span>{formatTokens(trace.inputTokens + trace.outputTokens)} tok</span>
        <span className="w-16 text-right">{formatCostUsd(trace.costUsd)}</span>
      </div>
      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export default function Overview() {
  const { user } = useAuth();
  const traces = useQuery(api.traces.list, { limit: 40 });

  if (traces === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const errors = traces.filter((trace) => trace.status === "error").length;
  const errorRate = traces.length > 0 ? (errors / traces.length) * 100 : 0;
  const medianDuration =
    traces.length > 0
      ? [...traces].sort((a, b) => a.durationMs - b.durationMs)[
          Math.floor(traces.length / 2)
        ].durationMs
      : undefined;
  const totalCost = traces.reduce((total, trace) => total + trace.costUsd, 0);
  const totalTokens = traces.reduce(
    (total, trace) => total + trace.inputTokens + trace.outputTokens,
    0,
  );
  const recent = traces.slice(0, 6);

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mono-label">Workbench</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {user?.name ? `Welcome back, ${user.name.split(" ")[0]}.` : "Your traces, in one place."}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Saved sample runs from the playground. Open a trace to inspect
            spans, payloads, usage, and scores.
          </p>
        </div>
        <Button asChild className="gap-2 self-start sm:self-auto">
          <Link to="/dashboard/playground">
            Run a sample trace
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Saved traces"
          value={String(traces.length)}
          detail="Up to 40 kept per account"
        />
        <MetricCard
          label="Error rate"
          value={traces.length > 0 ? `${errorRate.toFixed(0)}%` : "—"}
          detail={`${errors} failed ${errors === 1 ? "run" : "runs"}`}
        />
        <MetricCard
          label="Median duration"
          value={formatMilliseconds(medianDuration)}
          detail="Across saved traces"
        />
        <MetricCard
          label="Reported tokens"
          value={formatTokens(totalTokens)}
          detail={`${formatCostUsd(totalCost)} estimated cost`}
          accent
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="mono-label">Recent</p>
              <h2 className="mt-0.5 text-sm font-medium">Latest traces</h2>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1">
              <Link to="/dashboard/traces">
                All traces <ChevronRight className="size-3.5" />
              </Link>
            </Button>
          </div>

          {recent.length > 0 ? (
            <div className="px-4 py-1">
              {recent.map((trace) => (
                <TraceRow key={trace.id} trace={trace} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <div className="grid size-10 place-items-center rounded-md border border-border bg-background">
                <FlaskConical className="size-4 text-primary" />
              </div>
              <p className="mt-4 text-sm font-medium">No traces saved yet</p>
              <p className="mt-1.5 max-w-xs text-xs leading-5 text-muted-foreground">
                Run a sample in the playground. It uses the real inspector
                package and records locally before saving here.
              </p>
              <Button asChild size="sm" className="mt-4 gap-1.5">
                <Link to="/dashboard/playground">
                  Open playground <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Terminal className="size-3.5 text-primary" />
              <p className="mono-label">Setup</p>
            </div>
            <h2 className="mt-3 text-sm font-medium">Use the package locally</h2>
            <p className="mt-1.5 text-[12px] leading-6 text-muted-foreground">
              The workbench shows sample runs. In your app, traces write to a
              local file by default.
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText("npm i @lithiumdevs/ai-inspector")
                  .then(() => toast("Install command copied"))
                  .catch(() => toast.error("Could not copy"));
              }}
              className="mt-3 flex w-full items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 font-mono text-[10px] text-foreground/80 hover:border-primary/30"
            >
              <span className="truncate">npm i @lithiumdevs/ai-inspector</span>
              <Terminal className="size-3 text-muted-foreground" />
            </button>
            <pre className="mt-2 overflow-hidden rounded-md border border-border bg-background p-2.5 font-mono text-[9.5px] leading-5 text-muted-foreground">
{`createNodeInspector({
  serviceName: "my-app",
});`}
            </pre>
            <a
              href="/#quickstart"
              className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] text-primary hover:underline"
            >
              Package quickstart <ArrowRight className="size-3" />
            </a>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mono-label">Status</p>
            <div className="mt-3 space-y-2 font-mono text-[10px]">
              {[
                ["capture", "preview"],
                ["storage", "convex workbench"],
                ["exporters", "memory (sample)"],
                ["pricing", "built-in table"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="text-foreground/80">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {errors > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-4 py-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-mono text-destructive">{errors}</span> saved{" "}
            {errors === 1 ? "trace ended" : "traces ended"} with an error.
          </p>
          <Link
            to="/dashboard/traces?status=error"
            className="font-mono text-[10px] text-destructive hover:underline"
          >
            Filter failures
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
        <span className={cn("rounded border px-1.5 py-0.5", traceStatusTone("ok"))}>ok</span>
        <span>local-first</span>
        <span>·</span>
        <span>no provider keys required</span>
      </div>
    </div>
  );
}
