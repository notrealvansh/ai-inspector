import type { CaptureSanitizer } from "./capture.js";
import { toAttributeValue } from "./capture.js";
import type { ContextManager } from "./context.js";
import { mergeUsage, serializeError } from "./errors.js";
import { newSpanId, newTraceId } from "./ids.js";
import type {
  Attributes,
  Cost,
  EvaluationResult,
  SpanData,
  SpanEvent,
  SpanKind,
  ToolCall,
  TraceData,
  Usage,
} from "./types.js";
import type {
  EndSpanPatch,
  EndTracePatch,
  GenerationHandle,
  GenerationOptions,
  SpanHandle,
  StartSpanOptions,
  StartTraceOptions,
  TraceHandle,
} from "./api.js";

export interface RecorderHost {
  readonly capture: CaptureSanitizer;
  readonly context: ContextManager;
  readonly baseAttributes: Attributes;
  now(): number;
  costFor(model: string | undefined, usage: Usage | undefined): Cost | undefined;
  exportTrace(trace: TraceData): void;
  reportError(error: Error, source: "exporter" | "internal"): void;
  debug(message: string): void;
}

function sanitizeAttributes(
  host: RecorderHost,
  attributes: Record<string, unknown> | undefined,
): Attributes {
  return host.capture.sanitizeAttributes(attributes ?? {});
}

function sanitizeToolCall(host: RecorderHost, toolCall: ToolCall): ToolCall {
  const input = host.capture.sanitize(toolCall.input);
  const output = host.capture.sanitize(toolCall.output);
  return {
    name: String(toolCall.name),
    ...(toolCall.id !== undefined ? { id: String(toolCall.id) } : {}),
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(toolCall.error ? { error: serializeError(toolCall.error) } : {}),
    ...(typeof toolCall.durationMs === "number" && toolCall.durationMs >= 0
      ? { durationMs: toolCall.durationMs }
      : {}),
  };
}

export class SpanRecorder implements GenerationHandle {
  readonly id: string;
  readonly traceId: string;
  private readonly host: RecorderHost;
  private readonly trace: TraceRecorder;
  private readonly record: SpanData;
  private ended = false;

  constructor(
    host: RecorderHost,
    trace: TraceRecorder,
    options: StartSpanOptions,
    kind: SpanKind,
    parentId: string | undefined,
  ) {
    this.host = host;
    this.trace = trace;
    this.id = newSpanId();
    this.traceId = trace.id;
    const startedAt = host.now();
    const input = host.capture.sanitize(options.input);
    this.record = {
      id: this.id,
      traceId: this.traceId,
      ...(parentId ? { parentId } : {}),
      name: options.name || kind,
      kind,
      status: "running",
      startedAt,
      ...(options.operation ? { operation: options.operation } : {}),
      ...(options.provider ? { provider: options.provider } : {}),
      ...(options.model ? { model: options.model } : {}),
      ...(input !== undefined ? { input } : {}),
      events: [],
      attributes: sanitizeAttributes(host, options.attributes),
    };
    trace.registerSpan(this);
  }

  get data(): Readonly<SpanData> {
    return this.record;
  }

  setAttribute(key: string, value: unknown): this {
    if (this.ended) return this;
    const attribute = toAttributeValue(value);
    if (attribute !== undefined) this.record.attributes[key] = attribute;
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    if (this.ended) return this;
    Object.assign(this.record.attributes, sanitizeAttributes(this.host, attributes));
    return this;
  }

  recordInput(value: unknown): this {
    if (this.ended) return this;
    const input = this.host.capture.sanitize(value);
    if (input !== undefined) this.record.input = input;
    return this;
  }

  recordOutput(value: unknown): this {
    if (this.ended) return this;
    const output = this.host.capture.sanitize(value);
    if (output !== undefined) this.record.output = output;
    return this;
  }

  setModel(model: string, provider?: string): this {
    if (this.ended) return this;
    if (model) this.record.model = model;
    if (provider) this.record.provider = provider;
    return this;
  }

  recordUsage(usage: Usage): this {
    if (this.ended) return this;
    const merged = mergeUsage(this.record.usage, usage);
    if (!merged) return this;
    this.record.usage = merged;
    this.record.cost = this.host.costFor(this.record.model, merged);
    return this;
  }

  markFirstToken(): this {
    if (this.ended || this.record.timeToFirstTokenMs !== undefined) return this;
    this.record.timeToFirstTokenMs = Math.max(0, this.host.now() - this.record.startedAt);
    return this;
  }

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    if (this.ended) return this;
    const event: SpanEvent = {
      name: String(name),
      at: this.host.now(),
      ...(attributes ? { attributes: sanitizeAttributes(this.host, attributes) } : {}),
    };
    this.record.events.push(event);
    return this;
  }

  addToolCall(toolCall: ToolCall): this {
    if (this.ended) return this;
    this.record.toolCalls = this.record.toolCalls ?? [];
    this.record.toolCalls.push(sanitizeToolCall(this.host, toolCall));
    return this;
  }

  addEvaluation(result: EvaluationResult): this {
    if (this.ended) return this;
    const reason =
      typeof result.reason === "string"
        ? this.host.capture.sanitize(result.reason)
        : undefined;
    const score = Number.isFinite(result.score)
      ? Math.min(1, Math.max(0, result.score))
      : 0;
    this.record.evaluations = this.record.evaluations ?? [];
    this.record.evaluations.push({
      scorer: String(result.scorer),
      score,
      passed: Boolean(result.passed),
      ...(typeof reason === "string" ? { reason } : {}),
    });
    return this;
  }

  startSpan(options: StartSpanOptions): SpanHandle {
    return new SpanRecorder(
      this.host,
      this.trace,
      options,
      options.kind ?? "custom",
      this.id,
    );
  }

  generation(options: GenerationOptions): GenerationHandle {
    return new SpanRecorder(
      this.host,
      this.trace,
      {
        ...options,
        name: options.name ?? options.model ?? "generation",
      },
      options.kind ?? "generation",
      this.id,
    );
  }

  run<T>(fn: (span: SpanHandle) => T): T {
    return this.host.context.run({ trace: this.trace, span: this }, () => fn(this));
  }

  end(patch: EndSpanPatch = {}): void {
    if (this.ended) return;

    if (patch.output !== undefined) this.recordOutput(patch.output);
    if (patch.usage) this.recordUsage(patch.usage);
    if (patch.model) this.setModel(patch.model, patch.provider);
    else if (patch.provider) this.record.provider = patch.provider;
    if (patch.attributes) this.setAttributes(patch.attributes);
    if (patch.timeToFirstTokenMs !== undefined && patch.timeToFirstTokenMs >= 0) {
      this.record.timeToFirstTokenMs = patch.timeToFirstTokenMs;
    }
    if (patch.toolCalls) {
      for (const toolCall of patch.toolCalls) this.addToolCall(toolCall);
    }
    if (patch.evaluations) {
      for (const evaluation of patch.evaluations) this.addEvaluation(evaluation);
    }

    if (patch.error !== undefined) {
      this.record.error = serializeError(patch.error);
      this.record.status = "error";
    } else {
      this.record.status = "ok";
    }

    this.endedAt();
  }

  fail(error: unknown, patch: Omit<EndSpanPatch, "error"> = {}): void {
    this.end({ ...patch, error });
  }

  markUnfinished(): void {
    if (this.ended) return;
    this.record.status = "unfinished";
    this.ended = true;
  }

  private endedAt(): void {
    const endedAt = this.host.now();
    this.record.endedAt = endedAt;
    this.record.durationMs = Math.max(0, endedAt - this.record.startedAt);
    if (this.record.usage) {
      this.record.cost = this.host.costFor(this.record.model, this.record.usage);
    }
    this.ended = true;
  }
}

export class TraceRecorder implements TraceHandle {
  readonly id: string;
  readonly rootSpanId: string;
  private readonly host: RecorderHost;
  private readonly record: TraceData;
  private readonly spanRecorders: SpanRecorder[] = [];
  private ended = false;

  constructor(host: RecorderHost, options: StartTraceOptions, sampled: boolean) {
    this.host = host;
    this.id = newTraceId();
    this.rootSpanId = newSpanId();
    const startedAt = host.now();
    const input = host.capture.sanitize(options.input);
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options.metadata ?? {})) {
      const sanitized = host.capture.sanitizeMetadata(value);
      if (sanitized !== undefined) metadata[key] = sanitized;
    }

    this.record = {
      id: this.id,
      rootSpanId: this.rootSpanId,
      name: options.name,
      status: "running",
      startedAt,
      sampled,
      metadata,
      tags: [...new Set((options.tags ?? []).filter((tag) => typeof tag === "string"))].slice(0, 32),
      attributes: {
        ...host.baseAttributes,
        ...sanitizeAttributes(host, options.attributes),
      },
      spans: [],
      ...(input !== undefined ? { input } : {}),
    };
  }

  get data(): Readonly<TraceData> {
    return this.record;
  }

  setAttribute(key: string, value: unknown): this {
    if (this.ended) return this;
    const attribute = toAttributeValue(value);
    if (attribute !== undefined) this.record.attributes[key] = attribute;
    return this;
  }

  setAttributes(attributes: Record<string, unknown>): this {
    if (this.ended) return this;
    Object.assign(this.record.attributes, sanitizeAttributes(this.host, attributes));
    return this;
  }

  setMetadata(key: string, value: unknown): this {
    if (this.ended) return this;
    const sanitized = this.host.capture.sanitizeMetadata(value);
    if (sanitized !== undefined) this.record.metadata[key] = sanitized;
    return this;
  }

  addTag(tag: string): this {
    if (this.ended || typeof tag !== "string") return this;
    if (!this.record.tags.includes(tag)) this.record.tags.push(tag);
    return this;
  }

  recordInput(value: unknown): this {
    if (this.ended) return this;
    const input = this.host.capture.sanitize(value);
    if (input !== undefined) this.record.input = input;
    return this;
  }

  recordOutput(value: unknown): this {
    if (this.ended) return this;
    const output = this.host.capture.sanitize(value);
    if (output !== undefined) this.record.output = output;
    return this;
  }

  startSpan(options: StartSpanOptions): SpanHandle {
    let parentId: string | undefined;
    const scope = this.host.context.active();
    if (scope?.trace === this) parentId = scope.span?.id;
    return new SpanRecorder(
      this.host,
      this,
      options,
      options.kind ?? "custom",
      parentId,
    );
  }

  generation(options: GenerationOptions): GenerationHandle {
    let parentId: string | undefined;
    const scope = this.host.context.active();
    if (scope?.trace === this) parentId = scope.span?.id;
    return new SpanRecorder(
      this.host,
      this,
      {
        ...options,
        name: options.name ?? options.model ?? "generation",
      },
      options.kind ?? "generation",
      parentId,
    );
  }

  /** @internal */
  registerSpan(span: SpanRecorder): void {
    if (this.ended) return;
    this.spanRecorders.push(span);
    this.record.spans.push(span.data as SpanData);
  }

  run<T>(fn: (trace: TraceHandle) => T): T {
    return this.host.context.run({ trace: this }, () => fn(this));
  }

  end(patch: EndTracePatch = {}): void {
    if (this.ended) return;

    if (patch.output !== undefined) this.recordOutput(patch.output);
    if (patch.attributes) this.setAttributes(patch.attributes);

    for (const span of this.spanRecorders) span.markUnfinished();

    if (patch.error !== undefined) {
      this.record.error = serializeError(patch.error);
      this.record.status = "error";
    } else {
      this.record.status = "ok";
    }

    const endedAt = this.host.now();
    this.record.endedAt = endedAt;
    this.record.durationMs = Math.max(0, endedAt - this.record.startedAt);
    const aggregate = aggregateUsageAndCost(this.record.spans);
    if (aggregate.usage) this.record.usage = aggregate.usage;
    if (aggregate.cost) this.record.cost = aggregate.cost;

    this.ended = true;

    if (this.record.sampled) {
      try {
        this.host.exportTrace(this.snapshot());
      } catch (error) {
        this.host.reportError(
          error instanceof Error ? error : new Error(String(error)),
          "internal",
        );
      }
    }
  }

  fail(error: unknown, patch: Omit<EndTracePatch, "error"> = {}): void {
    this.end({ ...patch, error });
  }

  private snapshot(): TraceData {
    return {
      ...this.record,
      metadata: { ...this.record.metadata },
      attributes: { ...this.record.attributes },
      tags: [...this.record.tags],
      spans: this.record.spans.map((span) => ({
        ...span,
        attributes: { ...span.attributes },
        events: [...span.events],
        ...(span.toolCalls ? { toolCalls: [...span.toolCalls] } : {}),
        ...(span.evaluations ? { evaluations: [...span.evaluations] } : {}),
      })),
      ...(this.record.usage ? { usage: { ...this.record.usage } } : {}),
      ...(this.record.cost ? { cost: { ...this.record.cost } } : {}),
    };
  }
}

function aggregateUsageAndCost(spans: SpanData[]): {
  usage?: Usage;
  cost?: Cost;
} {
  const withUsage = spans.filter((span) => span.usage);
  if (withUsage.length === 0) return {};

  let hasAllInput = true;
  let hasAllOutput = true;
  let hasAllTotal = true;
  let hasAllCost = true;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let inputUsd = 0;
  let outputUsd = 0;
  let totalUsd = 0;
  let anyCustomPricing = false;

  for (const span of withUsage) {
    const usage = span.usage as Usage;
    if (usage.inputTokens === undefined) hasAllInput = false;
    else inputTokens += usage.inputTokens;
    if (usage.outputTokens === undefined) hasAllOutput = false;
    else outputTokens += usage.outputTokens;
    if (usage.totalTokens === undefined) hasAllTotal = false;
    else totalTokens += usage.totalTokens;

    if (!span.cost) {
      hasAllCost = false;
    } else {
      inputUsd += span.cost.inputUsd;
      outputUsd += span.cost.outputUsd;
      totalUsd += span.cost.totalUsd;
      if (span.cost.source === "custom") anyCustomPricing = true;
    }
  }

  const usage: Usage = {};
  if (hasAllInput) usage.inputTokens = inputTokens;
  if (hasAllOutput) usage.outputTokens = outputTokens;
  if (hasAllTotal) usage.totalTokens = totalTokens;

  return {
    ...(Object.keys(usage).length > 0 ? { usage } : {}),
    ...(hasAllCost
      ? {
          cost: {
            inputUsd,
            outputUsd,
            totalUsd,
            currency: "USD" as const,
            source: anyCustomPricing ? ("custom" as const) : ("builtin" as const),
          },
        }
      : {}),
  };
}
