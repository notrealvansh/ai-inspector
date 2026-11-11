/** Attribute values that can be exported to OpenTelemetry without conversion. */
export type AttributeValue = string | number | boolean;

export type Attributes = Record<string, AttributeValue>;

export type SpanKind =
  | "generation"
  | "embedding"
  | "rerank"
  | "retrieval"
  | "tool"
  | "agent"
  | "evaluation"
  | "custom";

/**
 * Running spans are open. Unfinished spans were still open when their trace
 * ended, which usually means an integration missed a call to `end()`.
 */
export type SpanStatus = "running" | "ok" | "error" | "unfinished";

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  reasoningTokens?: number;
}

export interface Cost {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  currency: "USD";
  source: "builtin" | "custom";
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface SpanEvent {
  name: string;
  at: number;
  attributes?: Attributes;
}

export interface ToolCall {
  name: string;
  id?: string;
  input?: unknown;
  output?: unknown;
  error?: SerializedError;
  durationMs?: number;
}

export interface EvaluationResult {
  scorer: string;
  score: number;
  passed: boolean;
  reason?: string;
}

export interface SpanData {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  kind: SpanKind;
  status: SpanStatus;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  operation?: string;
  provider?: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  usage?: Usage;
  cost?: Cost;
  timeToFirstTokenMs?: number;
  toolCalls?: ToolCall[];
  evaluations?: EvaluationResult[];
  events: SpanEvent[];
  attributes: Attributes;
  error?: SerializedError;
}

export interface TraceData {
  id: string;
  /** Span id used as the trace root when exporting to OpenTelemetry. */
  rootSpanId: string;
  name: string;
  status: Exclude<SpanStatus, "unfinished">;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  sampled: boolean;
  input?: unknown;
  output?: unknown;
  metadata: Record<string, unknown>;
  tags: string[];
  attributes: Attributes;
  spans: SpanData[];
  usage?: Usage;
  cost?: Cost;
  error?: SerializedError;
}

export interface Exporter {
  readonly name?: string;
  exportTrace(trace: TraceData): void | Promise<void>;
  flush?(): void | Promise<void>;
  shutdown?(): void | Promise<void>;
}
