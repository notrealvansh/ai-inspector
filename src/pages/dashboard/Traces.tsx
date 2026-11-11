import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, Search, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { TraceDetail } from "@/components/TraceDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TraceSummary } from "@/lib/convex-types";
import {
  formatCostUsd,
  formatMilliseconds,
  formatRelativeTime,
  formatStartedAt,
  formatTokens,
  parseTraceData,
  traceStatusTone,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "ok" | "error";

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "size-1.5 rounded-full",
        status === "error" ? "bg-destructive" : "bg-primary",
      )}
    />
  );
}

function TraceListRow({
  trace,
  onOpen,
}: {
  trace: TraceSummary;
  onOpen: (trace: TraceSummary) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(trace)}
      className="group grid w-full gap-2 border-b border-border/60 px-4 py-3.5 text-left transition-colors last:border-0 hover:bg-white/[0.02] md:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_0.9fr_0.8fr_0.9fr_0.7fr_auto] md:items-center md:gap-4"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <StatusDot status={trace.status} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium">{trace.name}</p>
          <p className="mt-0.5 truncate font-mono text-[9.5px] text-muted-foreground md:hidden">
            {trace.scenario} · {formatRelativeTime(trace.startedAt)}
          </p>
        </div>
      </div>
      <span className="hidden truncate font-mono text-[10px] text-muted-foreground md:block">
        {trace.scenario}
      </span>
      <span className="hidden font-mono text-[10px] text-muted-foreground md:block">
        {formatStartedAt(trace.startedAt)}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {formatMilliseconds(trace.durationMs)}
      </span>
      <span className="hidden font-mono text-[10px] text-muted-foreground md:block">
        {formatTokens(trace.inputTokens)} / {formatTokens(trace.outputTokens)}
      </span>
      <span className="font-mono text-[10px] text-primary/80">
        {formatCostUsd(trace.costUsd)}
      </span>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 font-mono text-[9px]",
            traceStatusTone(trace.status),
          )}
        >
          {trace.status}
        </span>
        <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

export default function Traces() {
  const traces = useQuery(api.traces.list, { limit: 40 });
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<Id<"traces"> | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>(() =>
    searchParams.get("status") === "error" ? "error" : "all",
  );
  const [deleting, setDeleting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const detail = useQuery(
    api.traces.get,
    selectedId ? { id: selectedId } : "skip",
  );
  const removeTrace = useMutation(api.traces.remove);
  const clearTraces = useMutation(api.traces.clear);

  useEffect(() => {
    const parameter = searchParams.get("trace");
    if (!parameter || !traces) return;
    const match = traces.find((trace) => trace.id === parameter);
    if (match && match.id !== selectedId) setSelectedId(match.id);
  }, [searchParams, traces, selectedId]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (traces ?? []).filter((trace) => {
      if (status !== "all" && trace.status !== status) return false;
      if (!query) return true;
      return (
        trace.name.toLowerCase().includes(query) ||
        trace.scenario.toLowerCase().includes(query)
      );
    });
  }, [traces, search, status]);

  const openTrace = (trace: TraceSummary) => {
    setSelectedId(trace.id);
    const next = new URLSearchParams(searchParams);
    next.set("trace", trace.id);
    setSearchParams(next, { replace: true });
  };

  const closeTrace = () => {
    setSelectedId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("trace");
    setSearchParams(next, { replace: true });
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await removeTrace({ id: selectedId });
      toast("Trace removed");
      closeTrace();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove the trace",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearTraces({});
      toast("Workbench cleared");
      closeTrace();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not clear the workbench",
      );
    } finally {
      setClearing(false);
    }
  };

  const parsedTrace = parseTraceData(detail?.data);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mono-label">Saved runs</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Traces</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Every run saved from the playground. Filter by status or name, then
            open a trace to inspect the span tree and payloads.
          </p>
        </div>
        <div className="flex gap-2 sm:self-auto">
          {traces && traces.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={clearing}>
                  <Trash2 className="size-3.5" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the workbench?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes all {traces.length} saved traces for this
                    account. It does not touch local files in your own apps.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      void handleClear();
                    }}
                  >
                    Clear traces
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button asChild size="sm" className="gap-1.5">
            <Link to="/dashboard/playground">
              New run <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search traces"
            className="h-9 bg-card pl-8 text-xs"
          />
        </div>
        <div className="flex gap-1">
          {(["all", "ok", "error"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={cn(
                "rounded border px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
                status === value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {traces === undefined ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : traces.length === 0 ? (
        <div className="rounded-lg border border-border bg-card px-6 py-16 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-md border border-border bg-background">
            <AlertTriangle className="size-4 text-primary" />
          </div>
          <p className="mt-4 text-sm font-medium">Nothing saved yet</p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
            Sample runs use the real package and are saved to this workbench.
            Start with the support agent or a failing checkout.
          </p>
          <Button asChild size="sm" className="mt-4 gap-1.5">
            <Link to="/dashboard/playground">
              Open playground <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="hidden grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_0.9fr_0.8fr_0.9fr_0.7fr_auto] gap-4 border-b border-border px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground md:grid">
            <span>Name</span>
            <span>Scenario</span>
            <span>Started</span>
            <span>Duration</span>
            <span>Tokens in / out</span>
            <span>Cost</span>
            <span className="text-right">Status</span>
          </div>

          {filtered.length > 0 ? (
            filtered.map((trace) => (
              <TraceListRow key={trace.id} trace={trace} onOpen={openTrace} />
            ))
          ) : (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No traces match this filter.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatus("all");
                }}
                className="mt-2 font-mono text-[10px] text-primary hover:underline"
              >
                Reset filters
              </button>
            </div>
          )}
        </div>
      )}

      <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/70">
        {traces?.length ?? 0} saved · 40 maximum · payloads are preview capture
      </p>

      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) closeTrace();
        }}
      >
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto p-4 md:p-6">
          <DialogHeader className="sr-only">
            <DialogTitle>Trace detail</DialogTitle>
            <DialogDescription>
              Span waterfall, payloads, usage, and evaluation results.
            </DialogDescription>
          </DialogHeader>

          <div className="mb-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-destructive"
              disabled={deleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deleting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Delete trace
            </Button>
          </div>

          {detail === undefined ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : detail === null ? (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium">Trace not found</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                It may have been removed from this workbench.
              </p>
            </div>
          ) : parsedTrace ? (
            <TraceDetail trace={parsedTrace} />
          ) : (
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium">Trace data is unreadable</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                The stored payload could not be parsed.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
