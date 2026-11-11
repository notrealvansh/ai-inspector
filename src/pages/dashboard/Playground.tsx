import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CircleAlert,
  FlaskConical,
  Loader2,
  Play,
  Radio,
  Search,
  Sparkles,
  Terminal,
} from "lucide-react";
import { Link } from "react-router";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { TraceDetail } from "@/components/TraceDetail";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { formatMilliseconds } from "@/lib/format";
import type { TraceData } from "@/lib/inspector";
import { scenarios, type Scenario } from "@/lib/scenarios";
import { cn } from "@/lib/utils";

const icons = {
  "support-agent": Search,
  "rag-research": Radio,
  "streaming-chat": Sparkles,
  "checkout-failure": CircleAlert,
} as const;

type SaveState = "idle" | "saving" | "saved" | "error";

function ScenarioCard({
  scenario,
  running,
  disabled,
  onRun,
}: {
  scenario: Scenario;
  running: boolean;
  disabled: boolean;
  onRun: (scenario: Scenario) => void;
}) {
  const Icon = icons[scenario.id as keyof typeof icons] ?? FlaskConical;
  const isErrorPath = scenario.id === "checkout-failure";

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border bg-card p-4 transition-colors",
        isErrorPath ? "border-destructive/25" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid size-8 place-items-center rounded-md border",
            isErrorPath
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-primary/20 bg-primary/[0.07] text-primary",
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">
          ~{formatMilliseconds(scenario.estimatedMs)}
        </span>
      </div>

      <h2 className="mt-4 text-sm font-medium">{scenario.title}</h2>
      <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-primary/80">
        {scenario.tagline}
      </p>
      <p className="mt-2 flex-1 text-[12px] leading-6 text-muted-foreground">
        {scenario.description}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {scenario.models.map((model) => (
          <span
            key={model}
            className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground"
          >
            {model}
          </span>
        ))}
        {scenario.tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground/80"
          >
            {tag}
          </span>
        ))}
      </div>

      <Button
        size="sm"
        variant={isErrorPath ? "outline" : "default"}
        className="mt-4 w-full gap-1.5"
        disabled={disabled}
        onClick={() => onRun(scenario)}
      >
        {running ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            Recording
          </>
        ) : (
          <>
            <Play className="size-3.5" />
            Run scenario
          </>
        )}
      </Button>
    </div>
  );
}

export default function Playground() {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const saveTrace = useMutation(api.traces.save);

  const persist = async (value: TraceData, scenarioId: string) => {
    setSaveState("saving");
    try {
      await saveTrace({
        scenario: scenarioId,
        data: JSON.stringify(value),
      });
      setSaveState("saved");
      toast.success("Trace saved to your workbench");
    } catch (saveError) {
      setSaveState("error");
      toast.error(
        saveError instanceof Error
          ? saveError.message
          : "The trace ran, but could not be saved.",
      );
    }
  };

  const run = async (scenario: Scenario) => {
    if (runningId) return;
    setRunningId(scenario.id);
    setActiveId(scenario.id);
    setTrace(null);
    setError(null);
    setSaveState("idle");
    try {
      const result = await scenario.run();
      setTrace(result);
      await persist(result, scenario.id);
    } catch (runError) {
      setError(
        runError instanceof Error
          ? runError.message
          : "The sample trace could not be recorded.",
      );
      toast.error("The sample trace could not be completed");
    } finally {
      setRunningId(null);
    }
  };

  const activeScenario = scenarios.find((scenario) => scenario.id === activeId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mono-label">Instrumented samples</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
            Playground
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Each scenario calls the real{" "}
            <span className="font-mono text-[12px] text-foreground/80">
              @yourname/ai-inspector
            </span>{" "}
            core in your browser. Model responses are simulated; timings, spans,
            token counts, pricing, and scores follow the package output.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5 self-start sm:self-auto">
          <Link to="/dashboard/traces">
            Saved traces <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {scenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            running={runningId === scenario.id}
            disabled={runningId !== null}
            onRun={run}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted-foreground/80">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-primary" /> real inspector core
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-amber-400" /> simulated model output
        </span>
        <span>pricing from the built-in table · sample data only</span>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/[0.06] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-destructive">
            Sample failed
          </p>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {runningId ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 text-center">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="mt-4 text-sm font-medium">Recording a trace</p>
          <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted-foreground">
            {activeScenario?.title ?? "Sample"} is running through the inspector.
            Spans are being recorded in order.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2 font-mono text-[9.5px] text-muted-foreground">
            <span className="rounded border border-border px-2 py-1">trace start</span>
            <span className="text-border">→</span>
            <span className="rounded border border-primary/25 bg-primary/[0.06] px-2 py-1 text-primary">
              spans
            </span>
            <span className="text-border">→</span>
            <span className="rounded border border-border px-2 py-1">export</span>
          </div>
        </div>
      ) : trace ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="border-t border-border pt-6"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mono-label">Live trace</p>
              <h2 className="mt-0.5 text-sm font-medium">
                {activeScenario?.title ?? trace.name}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]",
                  saveState === "saved" && "border-primary/25 bg-primary/10 text-primary",
                  saveState === "saving" && "border-border bg-muted text-muted-foreground",
                  saveState === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
                  saveState === "idle" && "border-border bg-muted text-muted-foreground",
                )}
              >
                {saveState === "saved"
                  ? "saved"
                  : saveState === "saving"
                    ? "saving"
                    : saveState === "error"
                      ? "not saved"
                      : "local"}
              </span>
              {saveState === "error" && activeId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void persist(trace, activeId);
                  }}
                >
                  Retry save
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="gap-1">
                <Link to="/dashboard/traces">
                  All traces <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
          </div>
          <TraceDetail trace={trace} />
        </motion.div>
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card/40 px-6 py-14">
          <div className="mx-auto max-w-lg text-center">
            <div className="mx-auto grid size-10 place-items-center rounded-md border border-border bg-background">
              <Terminal className="size-4 text-primary" />
            </div>
            <h2 className="mt-4 text-sm font-medium">Run a scenario to inspect it</h2>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              A trace will appear here with the same waterfall, span inspector,
              token totals, cost estimates, tool calls, and eval scores you get
              from the package in your own app.
            </p>
            <pre className="mx-auto mt-5 max-w-sm overflow-hidden rounded-md border border-border bg-background p-3 text-left font-mono text-[9.5px] leading-5 text-muted-foreground">
{`inspector.trace("support-request", async (trace) => {
  const span = trace.generation({ ... });
  span.end({ output, usage });
});`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
