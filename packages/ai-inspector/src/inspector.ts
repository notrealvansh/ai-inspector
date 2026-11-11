import type {
  EvaluationOptions,
  GenerationHandle,
  GenerationOptions,
  Inspector,
  InspectorOptions,
  SpanHandle,
  StartSpanOptions,
  StartTraceOptions,
  TraceHandle,
} from "./api.js";
import { createSanitizer } from "./capture.js";
import { detectNodeContext, createSyncContext } from "./context.js";
import type { ContextManager } from "./context.js";
import { runScorers } from "./evals.js";
import type { Scorer } from "./evals.js";
import { estimateCost, findPricing } from "./pricing.js";
import type { PricingTable } from "./pricing.js";
import { TraceRecorder } from "./recorder.js";
import type { RecorderHost } from "./recorder.js";
import type { Attributes, Cost, EvaluationResult, Exporter, TraceData, Usage } from "./types.js";

type ErrorSource = "exporter" | "scorer" | "internal";

class InspectorImpl implements Inspector, RecorderHost {
  readonly enabled: boolean;
  readonly capture: ReturnType<typeof createSanitizer>;
  readonly context: ContextManager;
  readonly baseAttributes: Attributes;

  private readonly options: InspectorOptions;
  private readonly exporters: Exporter[];
  private readonly pricing?: PricingTable;
  private readonly clock: () => number;
  private readonly sampleRate: number;
  private readonly pending = new Set<Promise<void>>();

  constructor(options: InspectorOptions = {}) {
    this.options = options;
    this.enabled = options.enabled ?? true;
    this.capture = createSanitizer(options.capture);
    this.context =
      options.context ?? detectNodeContext() ?? createSyncContext();
    this.exporters = options.exporters ?? [];
    this.pricing = options.pricing;
    this.clock = options.clock ?? (() => Date.now());
    this.sampleRate = clamp(options.sampleRate ?? 1, 0, 1);
    this.baseAttributes = {
      ...(options.serviceName ? { "service.name": options.serviceName } : {}),
      ...(options.environment
        ? { "deployment.environment": options.environment }
        : {}),
    };

    if (this.capture.mode === "full" && this.exporters.length > 0) {
      this.debug(
        "capture is set to full and exporters are configured; prompts and responses may leave this process",
      );
    }
  }

  now(): number {
    return this.clock();
  }

  costFor(model: string | undefined, usage: Usage | undefined): Cost | undefined {
    const match = findPricing(model, this.pricing);
    if (!match) return undefined;
    return estimateCost(usage, match);
  }

  activeTrace(): TraceHandle | undefined {
    return this.context.active()?.trace as TraceHandle | undefined;
  }

  startTrace(options: StartTraceOptions): TraceHandle {
    const sampled = this.enabled && Math.random() < this.sampleRate;
    return new TraceRecorder(
      this,
      { ...options, name: options.name || "trace" },
      sampled,
    );
  }

  async trace<T>(
    name: string,
    fn: (trace: TraceHandle) => T | Promise<T>,
    options: Omit<StartTraceOptions, "name"> = {},
  ): Promise<T> {
    const trace = this.startTrace({ ...options, name });
    return trace.run(async () => {
      try {
        const result = await fn(trace);
        if (result !== undefined) trace.recordOutput(result);
        trace.end();
        return result;
      } catch (error) {
        trace.fail(error);
        throw error;
      }
    });
  }

  startSpan(options: StartSpanOptions): SpanHandle {
    const scope = this.context.active();
    if (scope) return scope.trace.startSpan(options);
    this.debug(`startSpan("${options.name}") called outside a trace; dropped`);
    return this.detachedSpan(options);
  }

  generation(options: GenerationOptions): GenerationHandle {
    const scope = this.context.active();
    if (scope) return scope.trace.generation(options);
    this.debug(`generation("${options.name ?? options.model}") called outside a trace; dropped`);
    return this.detachedSpan({
      ...options,
      name: options.name ?? options.model ?? "generation",
    }) as GenerationHandle;
  }

  async evaluate(options: EvaluationOptions): Promise<EvaluationResult[]> {
    const active = this.activeTrace();
    const ownsTrace = !active;
    const trace = active ?? this.startTrace({ name: `eval:${options.name}` });
    const span = trace.startSpan({
      name: options.name,
      kind: "evaluation",
      operation: "evaluate",
      attributes: {
        "evaluation.threshold": options.threshold ?? 0.5,
        ...(options.metadata ?? {}),
      },
    });
    span.recordInput({
      input: options.input,
      output: options.output,
      expected: options.expected,
    });

    try {
      const results = await runScorers({
        ...(options.input !== undefined ? { input: options.input } : {}),
        output: options.output,
        ...(options.expected !== undefined ? { expected: options.expected } : {}),
        ...(options.metadata ? { metadata: options.metadata } : {}),
        scorers: options.scorers,
        ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
      });
      for (const result of results) span.addEvaluation(result);
      span.end({ output: { scores: results } });
      if (ownsTrace) trace.end();
      return results;
    } catch (error) {
      span.fail(error);
      if (ownsTrace) trace.fail(error);
      throw error;
    }
  }

  exportTrace(trace: TraceData): void {
    for (const exporter of this.exporters) {
      try {
        const result = exporter.exportTrace(trace);
        if (isPromise(result)) {
          const task = Promise.resolve(result)
            .catch((error: unknown) => {
              this.reportError(
                toError(error, exporter.name),
                "exporter",
              );
            })
            .finally(() => {
              this.pending.delete(task);
            });
          this.pending.add(task);
        }
      } catch (error) {
        this.reportError(toError(error, exporter.name), "exporter");
      }
    }
  }

  reportError(error: Error, source: ErrorSource): void {
    if (this.options.onError) {
      try {
        this.options.onError(error, source);
        return;
      } catch {
        // Fall through to the console warning.
      }
    }
    console.warn(`[ai-inspector] ${source} error: ${error.message}`);
  }

  debug(message: string): void {
    if (this.options.debug) console.debug(`[ai-inspector] ${message}`);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.pending]);
    for (const exporter of this.exporters) {
      try {
        await exporter.flush?.();
      } catch (error) {
        this.reportError(toError(error, exporter.name), "exporter");
      }
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();
    for (const exporter of this.exporters) {
      try {
        await exporter.shutdown?.();
      } catch (error) {
        this.reportError(toError(error, exporter.name), "exporter");
      }
    }
  }

  private detachedSpan(options: StartSpanOptions): SpanHandle {
    const trace = new TraceRecorder(this, { name: "detached" }, false);
    return trace.startSpan(options);
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.min(max, Math.max(min, value));
}

function isPromise(value: unknown): value is Promise<void> {
  return Boolean(value && typeof (value as Promise<void>).then === "function");
}

function toError(error: unknown, exporterName?: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(exporterName ? `${exporterName}: ${message}` : message);
}

export function createInspector(options: InspectorOptions = {}): Inspector {
  return new InspectorImpl(options);
}

export type { Scorer };
