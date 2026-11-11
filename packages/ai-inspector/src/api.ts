import type { CaptureOptions } from "./capture.js";
import type { ContextManager } from "./context.js";
import type {
  AttributeValue,
  Cost,
  EvaluationResult,
  Exporter,
  SpanData,
  SpanKind,
  TraceData,
  Usage,
  ToolCall,
} from "./types.js";
import type { PricingTable } from "./pricing.js";
import type { Scorer } from "./evals.js";

export interface StartTraceOptions {
  name: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  tags?: string[];
}

export interface StartSpanOptions {
  name: string;
  kind?: SpanKind;
  operation?: string;
  provider?: string;
  model?: string;
  input?: unknown;
  attributes?: Record<string, unknown>;
}

export interface GenerationOptions extends Omit<StartSpanOptions, "name" | "kind"> {
  name?: string;
  kind?: "generation" | "embedding" | "rerank";
}

export interface EndSpanPatch {
  output?: unknown;
  usage?: Usage;
  model?: string;
  provider?: string;
  attributes?: Record<string, unknown>;
  toolCalls?: ToolCall[];
  evaluations?: EvaluationResult[];
  timeToFirstTokenMs?: number;
  error?: unknown;
}

export interface EndTracePatch {
  output?: unknown;
  error?: unknown;
  attributes?: Record<string, unknown>;
}

export interface SpanHandle {
  readonly id: string;
  readonly traceId: string;
  readonly data: Readonly<SpanData>;
  setAttribute(key: string, value: AttributeValue | null | undefined): this;
  setAttributes(attributes: Record<string, unknown>): this;
  recordInput(value: unknown): this;
  recordOutput(value: unknown): this;
  setModel(model: string, provider?: string): this;
  recordUsage(usage: Usage): this;
  addEvent(name: string, attributes?: Record<string, unknown>): this;
  addToolCall(toolCall: ToolCall): this;
  addEvaluation(result: EvaluationResult): this;
  startSpan(options: StartSpanOptions): SpanHandle;
  generation(options: GenerationOptions): GenerationHandle;
  /** Runs a callback with this span as the active scope. */
  run<T>(fn: (span: SpanHandle) => T): T;
  end(patch?: EndSpanPatch): void;
  fail(error: unknown, patch?: Omit<EndSpanPatch, "error">): void;
}

export interface GenerationHandle extends SpanHandle {
  /** Records time-to-first-token relative to the generation start. Idempotent. */
  markFirstToken(): this;
}

export interface TraceHandle {
  readonly id: string;
  readonly data: Readonly<TraceData>;
  setAttribute(key: string, value: AttributeValue | null | undefined): this;
  setAttributes(attributes: Record<string, unknown>): this;
  setMetadata(key: string, value: unknown): this;
  addTag(tag: string): this;
  recordInput(value: unknown): this;
  recordOutput(value: unknown): this;
  startSpan(options: StartSpanOptions): SpanHandle;
  generation(options: GenerationOptions): GenerationHandle;
  /** Runs a callback with this trace as the active scope. */
  run<T>(fn: (trace: TraceHandle) => T): T;
  end(patch?: EndTracePatch): void;
  fail(error: unknown, patch?: Omit<EndTracePatch, "error">): void;
}

export interface EvaluationOptions {
  name: string;
  input?: unknown;
  output: unknown;
  expected?: unknown;
  scorers: Scorer[];
  /** Minimum score for each scorer to pass. Defaults to 0.5. */
  threshold?: number;
  metadata?: Record<string, unknown>;
}

export interface InspectorOptions {
  /** Adds `service.name` to trace attributes. */
  serviceName?: string;
  /** Adds `deployment.environment` to trace attributes. */
  environment?: string;
  /** Set to false to stop exporting traces. Defaults to true. */
  enabled?: boolean;
  capture?: CaptureOptions;
  /** 0 to 1. Non-sampled traces still run but are never exported. */
  sampleRate?: number;
  exporters?: Exporter[];
  /** Per-model overrides, merged over the built-in pricing table. */
  pricing?: PricingTable;
  context?: ContextManager;
  clock?: () => number;
  onError?: (error: Error, source: "exporter" | "scorer" | "internal") => void;
  debug?: boolean;
}

export interface Inspector {
  readonly enabled: boolean;
  /** Current trace from async context, when the runtime supports it. */
  activeTrace(): TraceHandle | undefined;
  startTrace(options: StartTraceOptions): TraceHandle;
  trace<T>(
    name: string,
    fn: (trace: TraceHandle) => T | Promise<T>,
    options?: Omit<StartTraceOptions, "name">,
  ): Promise<T>;
  startSpan(options: StartSpanOptions): SpanHandle;
  generation(options: GenerationOptions): GenerationHandle;
  evaluate(options: EvaluationOptions): Promise<EvaluationResult[]>;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  /** Cost lookup using the configured custom and built-in pricing tables. */
  costFor(model: string | undefined, usage: Usage | undefined): Cost | undefined;
}
