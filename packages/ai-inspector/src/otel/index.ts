import type { AttributeValue, Exporter, SpanData, TraceData } from "../types.js";
import { PACKAGE_NAME, VERSION } from "../version.js";

export interface OtlpAttribute {
  key: string;
  value: {
    stringValue?: string;
    boolValue?: boolean;
    intValue?: string;
    doubleValue?: number;
  };
}

export interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  status?: { code: number; message?: string };
  events?: Array<{
    timeUnixNano: string;
    name: string;
    attributes: OtlpAttribute[];
  }>;
}

export interface OtlpPayload {
  resourceSpans: Array<{
    resource: { attributes: OtlpAttribute[] };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OtlpSpan[];
    }>;
  }>;
}

export interface OtlpExporterOptions {
  /** Collector base URL or a full `/v1/traces` URL. */
  endpoint: string;
  headers?: Record<string, string>;
  resourceAttributes?: Record<string, AttributeValue>;
  serviceName?: string;
  fetch?: FetchLike;
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
}>;

function toAttribute(key: string, value: unknown): OtlpAttribute | undefined {
  if (typeof value === "string") {
    return { key, value: { stringValue: value } };
  }
  if (typeof value === "boolean") {
    return { key, value: { boolValue: value } };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value)
      ? { key, value: { intValue: String(value) } }
      : { key, value: { doubleValue: value } };
  }
  if (value !== undefined && value !== null) {
    try {
      return { key, value: { stringValue: JSON.stringify(value) } };
    } catch {
      return { key, value: { stringValue: String(value) } };
    }
  }
  return undefined;
}

function attributes(values: Record<string, unknown>): OtlpAttribute[] {
  return Object.entries(values)
    .map(([key, value]) => toAttribute(key, value))
    .filter((attribute): attribute is OtlpAttribute => attribute !== undefined);
}

function unixNano(milliseconds: number): string {
  return String(Math.round(milliseconds * 1_000_000));
}

const OPERATIONS: Record<SpanData["kind"], string> = {
  generation: "chat",
  embedding: "embeddings",
  rerank: "rerank",
  retrieval: "retrieval",
  tool: "execute_tool",
  agent: "invoke_agent",
  evaluation: "evaluation",
  custom: "custom",
};

const SPAN_KINDS: Record<SpanData["kind"], number> = {
  generation: 3,
  embedding: 3,
  rerank: 3,
  retrieval: 1,
  tool: 1,
  agent: 1,
  evaluation: 1,
  custom: 1,
};

function spanAttributes(trace: TraceData, span: SpanData): OtlpAttribute[] {
  const values: Record<string, unknown> = {
    ...span.attributes,
    "ai_inspector.span.kind": span.kind,
    "ai_inspector.trace.name": trace.name,
    "gen_ai.operation.name": OPERATIONS[span.kind],
  };
  if (span.operation) values["ai_inspector.operation"] = span.operation;
  if (span.provider) {
    values["gen_ai.provider.name"] = span.provider;
    values["gen_ai.system"] = span.provider;
  }
  if (span.model) {
    values["gen_ai.request.model"] = span.model;
    values["gen_ai.response.model"] = span.model;
  }
  if (span.usage?.inputTokens !== undefined) {
    values["gen_ai.usage.input_tokens"] = span.usage.inputTokens;
  }
  if (span.usage?.outputTokens !== undefined) {
    values["gen_ai.usage.output_tokens"] = span.usage.outputTokens;
  }
  if (span.usage?.totalTokens !== undefined) {
    values["gen_ai.usage.total_tokens"] = span.usage.totalTokens;
  }
  if (span.usage?.cachedInputTokens !== undefined) {
    values["ai_inspector.cached_input_tokens"] = span.usage.cachedInputTokens;
  }
  if (span.usage?.reasoningTokens !== undefined) {
    values["ai_inspector.reasoning_tokens"] = span.usage.reasoningTokens;
  }
  if (span.cost) {
    values["ai_inspector.cost_usd"] = span.cost.totalUsd;
  }
  if (span.timeToFirstTokenMs !== undefined) {
    values["ai_inspector.time_to_first_token_ms"] = span.timeToFirstTokenMs;
  }
  if (span.input !== undefined) values["ai_inspector.input"] = span.input;
  if (span.output !== undefined) values["ai_inspector.output"] = span.output;
  if (span.toolCalls?.length) values["ai_inspector.tool_calls"] = span.toolCalls;
  if (span.evaluations?.length) values["ai_inspector.evaluations"] = span.evaluations;
  if (span.status === "unfinished") values["ai_inspector.unfinished"] = true;
  return attributes(values);
}

function spanEvents(span: SpanData): NonNullable<OtlpSpan["events"]> {
  const events: NonNullable<OtlpSpan["events"]> = span.events.map((event) => ({
    timeUnixNano: unixNano(event.at),
    name: event.name,
    attributes: attributes(event.attributes ?? {}),
  }));
  if (span.error) {
    events.push({
      timeUnixNano: unixNano(span.endedAt ?? span.startedAt),
      name: "exception",
      attributes: attributes({
        "exception.type": span.error.name,
        "exception.message": span.error.message,
        ...(span.error.stack ? { "exception.stacktrace": span.error.stack } : {}),
      }),
    });
  }
  return events;
}

export function traceToOtlp(
  trace: TraceData,
  options: {
    serviceName?: string;
    resourceAttributes?: Record<string, AttributeValue>;
  } = {},
): OtlpPayload {
  const endedAt = trace.endedAt ?? trace.startedAt;
  const rootAttributes: Record<string, unknown> = {
    ...trace.attributes,
    "ai_inspector.trace.status": trace.status,
    "ai_inspector.sampled": trace.sampled,
    ...(trace.tags.length > 0 ? { "ai_inspector.tags": trace.tags } : {}),
    ...(Object.keys(trace.metadata).length > 0
      ? { "ai_inspector.metadata": trace.metadata }
      : {}),
    ...(trace.usage?.inputTokens !== undefined
      ? { "gen_ai.usage.input_tokens": trace.usage.inputTokens }
      : {}),
    ...(trace.usage?.outputTokens !== undefined
      ? { "gen_ai.usage.output_tokens": trace.usage.outputTokens }
      : {}),
    ...(trace.cost ? { "ai_inspector.cost_usd": trace.cost.totalUsd } : {}),
  };
  if (trace.input !== undefined) rootAttributes["ai_inspector.input"] = trace.input;
  if (trace.output !== undefined) rootAttributes["ai_inspector.output"] = trace.output;

  const rootSpan: OtlpSpan = {
    traceId: trace.id,
    spanId: trace.rootSpanId,
    name: trace.name,
    kind: 1,
    startTimeUnixNano: unixNano(trace.startedAt),
    endTimeUnixNano: unixNano(endedAt),
    attributes: attributes(rootAttributes),
    ...(trace.error
      ? {
          status: {
            code: 2,
            message: trace.error.message,
          },
        }
      : {}),
    events: trace.error
      ? [
          {
            timeUnixNano: unixNano(endedAt),
            name: "exception",
            attributes: attributes({
              "exception.type": trace.error.name,
              "exception.message": trace.error.message,
              ...(trace.error.stack
                ? { "exception.stacktrace": trace.error.stack }
                : {}),
            }),
          },
        ]
      : [],
  };

  const spans: OtlpSpan[] = [rootSpan];
  for (const span of trace.spans) {
    spans.push({
      traceId: trace.id,
      spanId: span.id,
      parentSpanId: span.parentId ?? trace.rootSpanId,
      name: span.name,
      kind: SPAN_KINDS[span.kind],
      startTimeUnixNano: unixNano(span.startedAt),
      endTimeUnixNano: unixNano(span.endedAt ?? endedAt),
      attributes: spanAttributes(trace, span),
      ...(span.status === "error" && span.error
        ? { status: { code: 2, message: span.error.message } }
        : {}),
      events: spanEvents(span),
    });
  }

  const resourceValues: Record<string, AttributeValue> = {
    "telemetry.sdk.name": "ai-inspector",
    "telemetry.sdk.version": VERSION,
    ...options.resourceAttributes,
  };
  const serviceName =
    options.serviceName ??
    (typeof trace.attributes["service.name"] === "string"
      ? trace.attributes["service.name"]
      : "unknown_service");
  resourceValues["service.name"] = serviceName;

  return {
    resourceSpans: [
      {
        resource: { attributes: attributes(resourceValues) },
        scopeSpans: [
          {
            scope: { name: PACKAGE_NAME, version: VERSION },
            spans,
          },
        ],
      },
    ],
  };
}

export class OtlpHttpExporter implements Exporter {
  readonly name = "otlp-http";
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly resourceAttributes?: Record<string, AttributeValue>;
  private readonly serviceName?: string;

  constructor(options: OtlpExporterOptions) {
    if (!options.endpoint) {
      throw new Error("An OTLP endpoint is required.");
    }
    const endpoint = options.endpoint.replace(/\/+$/, "");
    this.url = /\/v1\/traces$/.test(endpoint)
      ? endpoint
      : `${endpoint}/v1/traces`;

    const runtimeFetch = (globalThis as { fetch?: FetchLike }).fetch;
    const fetchImpl = options.fetch ?? runtimeFetch;
    if (!fetchImpl) {
      throw new Error("No fetch implementation is available for OTLP export.");
    }
    this.fetchImpl = fetchImpl;
    this.headers = {
      "content-type": "application/json",
      ...options.headers,
    };
    this.resourceAttributes = options.resourceAttributes;
    this.serviceName = options.serviceName;
  }

  async exportTrace(trace: TraceData): Promise<void> {
    const payload = traceToOtlp(trace, {
      ...(this.serviceName ? { serviceName: this.serviceName } : {}),
      ...(this.resourceAttributes ? { resourceAttributes: this.resourceAttributes } : {}),
    });
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      let detail = "";
      try {
        detail = response.text ? `: ${await response.text()}` : "";
      } catch {
        detail = "";
      }
      throw new Error(`OTLP export failed with status ${response.status}${detail}`);
    }
  }
}

export function otlpHttpExporter(options: OtlpExporterOptions): OtlpHttpExporter {
  return new OtlpHttpExporter(options);
}
