import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { SPAN_KIND_TONE } from "@/lib/format";
import type { SpanKind } from "@/lib/inspector";

const rows: Array<{
  name: string;
  kind: SpanKind;
  meta: string;
  start: number;
  width: number;
  indent?: boolean;
  detail?: string;
}> = [
  {
    name: "support-agent.run",
    kind: "agent",
    meta: "agent",
    start: 0,
    width: 100,
  },
  {
    name: "help-center.search",
    kind: "retrieval",
    meta: "171 ms · 3 docs",
    start: 3,
    width: 14,
    indent: true,
  },
  {
    name: "classify-intent",
    kind: "generation",
    meta: "210 ms · 350 tok",
    start: 20,
    width: 17,
    indent: true,
  },
  {
    name: "lookup_order",
    kind: "tool",
    meta: "190 ms · ok",
    start: 41,
    width: 16,
    indent: true,
  },
  {
    name: "draft-reply",
    kind: "generation",
    meta: "360 ms · 1.4k tok",
    start: 59,
    width: 30,
    indent: true,
    detail: "ttft 64ms",
  },
  {
    name: "reply-quality",
    kind: "evaluation",
    meta: "2 scorers · 1.0",
    start: 93,
    width: 5,
    indent: true,
  },
];

export function TracePreview() {
  return (
    <div className="relative">
      <div className="absolute -inset-px rounded-xl border border-primary/15" />
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-[oklch(0.175_0.012_250)]">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="size-1.5 rounded-full bg-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              trace / 4f2a1c0b
            </span>
          </div>
          <span className="rounded border border-primary/25 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
            ok
          </span>
        </div>

        <div className="border-b border-border/70 px-4 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-sm font-medium">support-agent</p>
              <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                service.support-api · prod
              </p>
            </div>
            <div className="flex items-center gap-4 font-mono text-[10px] text-muted-foreground">
              <span>1.14s</span>
              <span>3.1k tok</span>
              <span className="text-primary">$0.00047</span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 font-mono text-[9px] text-muted-foreground/60">
            <span>0 ms</span>
            <div className="h-px flex-1 bg-border/60" />
            <span>1,140 ms</span>
          </div>
        </div>

        <div className="space-y-1 px-3 py-3">
          {rows.map((row, index) => {
            const tone = SPAN_KIND_TONE[row.kind];
            return (
              <div
                key={row.name}
                className={cn(
                  "group flex items-center gap-2 rounded px-1.5 py-1.5",
                  row.indent && "pl-5",
                )}
              >
                <span
                  className={cn("size-1.5 shrink-0 rounded-full", tone.dot)}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[11px] text-foreground/90">
                      {row.name}
                    </span>
                    <span className="hidden shrink-0 font-mono text-[9px] text-muted-foreground sm:block">
                      {row.meta}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-[5px] flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                      <motion.div
                        className={cn("h-full rounded-sm", tone.bar, row.kind === "agent" && "opacity-35")}
                        style={{ width: `${row.width}%`, marginLeft: `${row.start}%` }}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{
                          duration: 0.55,
                          delay: 0.25 + index * 0.08,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                      />
                    </div>
                    {row.detail ? (
                      <span className="hidden font-mono text-[9px] text-primary/80 md:block">
                        {row.detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 bg-white/[0.015] px-4 py-2.5 font-mono text-[9px] text-muted-foreground">
          <span>exporters: jsonl · console</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-primary/70" />
            capture: preview
          </span>
        </div>
      </div>

      <div className="absolute -bottom-3 -left-3 hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
        <span className="size-1.5 rounded-full bg-amber-400" />
        tool span recorded
      </div>
      <div className="absolute -right-2 -top-3 hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground sm:flex">
        no account needed
      </div>
    </div>
  );
}
