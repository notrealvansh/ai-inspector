import type { GenerationHandle, Inspector, TraceHandle } from "../api.js";
import type { ToolCall, Usage } from "../types.js";

type UnknownRecord = Record<string, unknown>;

export interface OpenAIInstrumentationOptions {
  /** Provider label stored on spans. Defaults to "openai". */
  provider?: string;
  /** Span name override. */
  name?: string;
  /** Trace name when the wrapper starts a trace on its own. */
  traceName?: string;
}

type Resource = "chat" | "responses" | "embeddings";

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function",
  );
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function mapUsage(value: unknown, embedding = false): Usage | undefined {
  const usage = record(value);
  const details = record(usage.prompt_tokens_details ?? usage.input_tokens_details);
  const inputTokens = numberValue(usage.prompt_tokens) ?? numberValue(usage.input_tokens);
  const outputTokens = numberValue(usage.completion_tokens) ?? numberValue(usage.output_tokens);
  const totalTokens = numberValue(usage.total_tokens);
  const cachedInputTokens = numberValue(details.cached_tokens);

  if (inputTokens === undefined && outputTokens === undefined) return undefined;
  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined
      ? { outputTokens }
      : embedding && inputTokens !== undefined
        ? { outputTokens: 0 }
        : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
  };
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((part) => {
        const item = record(part);
        return typeof item.text === "string" ? item.text : "";
      })
      .join("");
  }
  return "";
}

function chatOutput(result: UnknownRecord): {
  output?: UnknownRecord;
  toolCalls: ToolCall[];
  model?: string;
} {
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const first = record(choices[0]);
  const message = record(first.message);
  const text = contentText(message.content);
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const toolCalls: ToolCall[] = rawToolCalls.map((raw) => {
    const call = record(raw);
    const fn = record(call.function);
    const name = String(fn.name ?? "tool");
    let input: unknown = fn.arguments;
    if (typeof fn.arguments === "string") {
      try {
        input = JSON.parse(fn.arguments);
      } catch {
        input = fn.arguments;
      }
    }
    return {
      name,
      ...(typeof call.id === "string" ? { id: call.id } : {}),
      ...(input !== undefined ? { input } : {}),
    };
  });

  return {
    output: {
      ...(text ? { text } : {}),
      ...(typeof first.finish_reason === "string"
        ? { finishReason: first.finish_reason }
        : {}),
    },
    toolCalls,
    ...(typeof result.model === "string" ? { model: result.model } : {}),
  };
}

function responsesOutput(result: UnknownRecord): {
  output?: UnknownRecord;
  model?: string;
} {
  const text =
    typeof result.output_text === "string"
      ? result.output_text
      : contentText(
          (Array.isArray(result.output) ? result.output : [])
            .map((item) => record(item).content)
            .flat(),
        );
  return {
    ...(text ? { output: { text } } : {}),
    ...(typeof result.model === "string" ? { model: result.model } : {}),
  };
}

function operationFor(resource: Resource): {
  operation: string;
  kind: "generation" | "embedding";
  traceName: string;
} {
  if (resource === "embeddings") {
    return {
      operation: "embeddings.create",
      kind: "embedding",
      traceName: "openai.embeddings",
    };
  }
  if (resource === "responses") {
    return {
      operation: "responses.create",
      kind: "generation",
      traceName: "openai.responses",
    };
  }
  return {
    operation: "chat.completions.create",
    kind: "generation",
    traceName: "openai.chat",
  };
}

export function instrumentOpenAI<T extends object>(
  inspector: Inspector,
  client: T,
  options: OpenAIInstrumentationOptions = {},
): T {
  const provider = options.provider ?? "openai";

  function wrapCreate(resource: Resource, create: (...args: unknown[]) => unknown, owner: unknown) {
    const meta = operationFor(resource);

    return async function instrumentedCreate(
      params: unknown = {},
      requestOptions?: unknown,
    ): Promise<unknown> {
      const paramsRecord = record(params);
      const model = typeof paramsRecord.model === "string" ? paramsRecord.model : undefined;
      const active = inspector.activeTrace();
      const ownsTrace = !active;
      const trace =
        active ??
        inspector.startTrace({
          name: options.traceName ?? meta.traceName,
          metadata: { source: provider },
        });
      const span: GenerationHandle = trace.generation({
        name: options.name ?? meta.operation,
        kind: meta.kind,
        operation: meta.operation,
        provider,
        ...(model ? { model } : {}),
        input: params,
      });

      if (paramsRecord.stream === true) {
        try {
          const stream = await create.apply(owner, [params, requestOptions]);
          if (!isAsyncIterable(stream)) {
            span.end({ attributes: { "openai.stream_unobservable": true } });
            finish(trace, ownsTrace);
            return stream;
          }
          return wrapCompletionStream(stream, span, trace, ownsTrace, resource, model);
        } catch (error) {
          span.fail(error);
          finish(trace, ownsTrace, error);
          throw error;
        }
      }

      try {
        const result = await create.apply(owner, [params, requestOptions]);
        const resultRecord = record(result);
        let output: UnknownRecord | undefined;
        let toolCalls: ToolCall[] = [];
        let resultModel = model;

        if (resource === "chat") {
          const mapped = chatOutput(resultRecord);
          output = mapped.output;
          toolCalls = mapped.toolCalls;
          resultModel = mapped.model ?? model;
        } else if (resource === "responses") {
          const mapped = responsesOutput(resultRecord);
          output = mapped.output;
          resultModel = mapped.model ?? model;
        } else {
          const embeddings = Array.isArray(resultRecord.data) ? resultRecord.data : [];
          const first = record(embeddings[0]);
          const dimensions = Array.isArray(first.embedding) ? first.embedding.length : undefined;
          output = {
            count: embeddings.length,
            ...(dimensions !== undefined ? { dimensions } : {}),
          };
        }

        span.end({
          ...(output && Object.keys(output).length > 0 ? { output } : {}),
          usage: mapUsage(resultRecord.usage, resource === "embeddings"),
          ...(resultModel ? { model: resultModel } : {}),
          ...(toolCalls.length > 0 ? { toolCalls } : {}),
        });
        finish(trace, ownsTrace);
        return result;
      } catch (error) {
        span.fail(error);
        finish(trace, ownsTrace, error);
        throw error;
      }
    };
  }

  function wrapCompletionStream(
    stream: AsyncIterable<unknown>,
    span: GenerationHandle,
    trace: TraceHandle,
    ownsTrace: boolean,
    resource: Resource,
    initialModel?: string,
  ): AsyncIterable<unknown> {
    let text = "";
    let model = initialModel;
    let usage: Usage | undefined;
    let finished = false;

    function complete(): void {
      if (finished) return;
      finished = true;
      const output =
        resource === "embeddings"
          ? undefined
          : text
            ? { text }
            : undefined;
      span.end({
        ...(output ? { output } : {}),
        ...(usage ? { usage } : {}),
        ...(model ? { model } : {}),
      });
      finish(trace, ownsTrace);
    }

    const generator = async function* (): AsyncGenerator<unknown> {
      try {
        for await (const chunk of stream) {
          const chunkRecord = record(chunk);
          if (typeof chunkRecord.model === "string") model = chunkRecord.model;
          const chunkUsage = mapUsage(chunkRecord.usage, resource === "embeddings");
          if (chunkUsage) usage = chunkUsage;
          const choices = Array.isArray(chunkRecord.choices) ? chunkRecord.choices : [];
          const delta = record(record(choices[0]).delta);
          const piece = contentText(delta.content);
          if (piece) {
            span.markFirstToken();
            text += piece;
          }
          yield chunk;
        }
        complete();
      } catch (error) {
        if (!finished) {
          finished = true;
          span.fail(error);
          finish(trace, ownsTrace, error);
        }
        throw error;
      }
    };

    return new Proxy(stream as object, {
      get(target, property, receiver) {
        if (property === Symbol.asyncIterator) return () => generator();
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as AsyncIterable<unknown>;
  }

  function wrapResource(resource: Resource, target: object): object {
    return new Proxy(target, {
      get(resourceTarget, property, receiver) {
        if (property === "create") {
          const create = Reflect.get(resourceTarget, property, receiver);
          if (typeof create === "function") {
            return wrapCreate(
              resource,
              create as (...args: unknown[]) => unknown,
              resourceTarget,
            );
          }
        }
        const value = Reflect.get(resourceTarget, property, receiver);
        return typeof value === "function" ? value.bind(resourceTarget) : value;
      },
    });
  }

  return new Proxy(client, {
    get(target, property, receiver) {
      if (property === "chat") {
        const chat = Reflect.get(target, property, receiver);
        if (chat && typeof chat === "object") {
          return new Proxy(chat, {
            get(chatTarget, chatProperty, chatReceiver) {
              if (chatProperty === "completions") {
                const completions = Reflect.get(chatTarget, chatProperty, chatReceiver);
                if (completions && typeof completions === "object") {
                  return wrapResource("chat", completions);
                }
              }
              const value = Reflect.get(chatTarget, chatProperty, chatReceiver);
              return typeof value === "function" ? value.bind(chatTarget) : value;
            },
          });
        }
        return chat;
      }
      if (property === "responses" || property === "embeddings") {
        const resource = Reflect.get(target, property, receiver);
        return resource && typeof resource === "object"
          ? wrapResource(property, resource)
          : resource;
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;
}

function finish(trace: TraceHandle, ownsTrace: boolean, error?: unknown): void {
  if (!ownsTrace) return;
  if (error !== undefined) trace.fail(error);
  else trace.end();
}
