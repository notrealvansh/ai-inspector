import type { GenerationHandle, Inspector, TraceHandle } from "../api.js";
import type { ToolCall, Usage } from "../types.js";

type UnknownRecord = Record<string, unknown>;

export interface AiSdkWrapperOptions {
  /** Span name. Defaults to the SDK operation name. */
  name?: string;
  /** Trace name when the wrapper starts a trace on its own. */
  traceName?: string;
  /** Operation label stored on the span. Defaults to the SDK function name. */
  operation?: string;
}

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

export function mapAiSdkUsage(value: unknown): Usage | undefined {
  const usage = record(value);
  if (Object.keys(usage).length === 0) return undefined;

  const inputDetails = record(usage.inputTokenDetails);
  const outputDetails = record(usage.outputTokenDetails);
  const inputTokens = numberValue(usage.inputTokens) ?? numberValue(usage.promptTokens);
  const outputTokens = numberValue(usage.outputTokens) ?? numberValue(usage.completionTokens);
  const totalTokens = numberValue(usage.totalTokens);
  const cachedInputTokens =
    numberValue(usage.cachedInputTokens) ??
    numberValue(inputDetails.cachedTokens) ??
    numberValue(inputDetails.cacheReadTokens);
  const reasoningTokens =
    numberValue(usage.reasoningTokens) ??
    numberValue(outputDetails.reasoningTokens);

  const output: Usage = {};
  if (inputTokens !== undefined) output.inputTokens = inputTokens;
  if (outputTokens !== undefined) output.outputTokens = outputTokens;
  if (totalTokens !== undefined) output.totalTokens = totalTokens;
  if (cachedInputTokens !== undefined) output.cachedInputTokens = cachedInputTokens;
  if (reasoningTokens !== undefined) output.reasoningTokens = reasoningTokens;
  return Object.keys(output).length > 0 ? output : undefined;
}

export function resolveAiSdkModel(value: unknown): {
  model?: string;
  provider?: string;
} {
  if (typeof value === "string") return { model: value };
  const model = record(value);
  const modelId = [model.modelId, model.id, model.model].find(
    (candidate): candidate is string => typeof candidate === "string" && candidate.length > 0,
  );
  const providerValue = model.provider;
  let provider: string | undefined;
  if (typeof providerValue === "string") provider = providerValue;
  else if (providerValue && typeof providerValue === "object") {
    const nested = record(providerValue);
    if (typeof nested.id === "string") provider = nested.id;
  }
  return {
    ...(modelId ? { model: modelId } : {}),
    ...(provider ? { provider } : {}),
  };
}

function toolCallsFromResult(result: UnknownRecord): ToolCall[] {
  const rawCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
  const rawResults = Array.isArray(result.toolResults) ? result.toolResults : [];
  return rawCalls.map((raw) => {
    const call = record(raw);
    const id = typeof call.toolCallId === "string" ? call.toolCallId : undefined;
    const match = rawResults
      .map(record)
      .find((entry) => id !== undefined && entry.toolCallId === id);
    const name = String(call.toolName ?? call.name ?? "tool");
    const input = call.input ?? call.args;
    const output = match ? (match.output ?? match.result) : undefined;
    return {
      name,
      ...(id ? { id } : {}),
      ...(input !== undefined ? { input } : {}),
      ...(output !== undefined ? { output } : {}),
    };
  });
}

function startGeneration(
  inspector: Inspector,
  operation: string,
  args: unknown,
  options: AiSdkWrapperOptions,
  kind: "generation" | "embedding",
): {
  trace: TraceHandle;
  span: GenerationHandle;
  ownsTrace: boolean;
  model?: string;
  provider?: string;
} {
  const argsRecord = record(args);
  const modelInfo = resolveAiSdkModel(argsRecord.model);
  const active = inspector.activeTrace();
  const ownsTrace = !active;
  const trace =
    active ??
    inspector.startTrace({
      name: options.traceName ?? operation,
      metadata: { source: "ai-sdk" },
    });
  const span = trace.generation({
    name: options.name ?? operation,
    kind,
    operation,
    ...(modelInfo.model ? { model: modelInfo.model } : {}),
    ...(modelInfo.provider ? { provider: modelInfo.provider } : {}),
    input: argsRecord,
  });
  return {
    trace,
    span,
    ownsTrace,
    ...(modelInfo.model ? { model: modelInfo.model } : {}),
    ...(modelInfo.provider ? { provider: modelInfo.provider } : {}),
  };
}

function finishOwned(trace: TraceHandle, ownsTrace: boolean, error?: unknown): void {
  if (!ownsTrace) return;
  if (error !== undefined) trace.fail(error);
  else trace.end();
}

export function wrapGenerateText<TArgs, TResult>(
  inspector: Inspector,
  generateText: (args: TArgs) => Promise<TResult>,
  options: AiSdkWrapperOptions = {},
): (args: TArgs) => Promise<TResult> {
  return async function instrumentedGenerateText(this: unknown, args: TArgs): Promise<TResult> {
    const operation = options.operation ?? "generateText";
    const { trace, span, ownsTrace, model, provider } = startGeneration(
      inspector,
      operation,
      args,
      options,
      "generation",
    );
    try {
      const result = await generateText.call(this, args);
      const resultRecord = record(result);
      const response = record(resultRecord.response);
      const toolCalls = toolCallsFromResult(resultRecord);
      const output = {
        ...(resultRecord.text !== undefined ? { text: resultRecord.text } : {}),
        ...(resultRecord.object !== undefined ? { object: resultRecord.object } : {}),
      };
      span.end({
        ...(Object.keys(output).length > 0 ? { output } : {}),
        usage: mapAiSdkUsage(resultRecord.usage),
        ...(typeof response.modelId === "string"
          ? { model: response.modelId }
          : model
            ? { model }
            : {}),
        ...(provider ? { provider } : {}),
        ...(toolCalls.length > 0 ? { toolCalls } : {}),
        ...(typeof resultRecord.finishReason === "string"
          ? { attributes: { "ai.finish_reason": resultRecord.finishReason } }
          : {}),
      });
      finishOwned(trace, ownsTrace);
      return result;
    } catch (error) {
      span.fail(error);
      finishOwned(trace, ownsTrace, error);
      throw error;
    }
  };
}

export function wrapGenerateObject<TArgs, TResult>(
  inspector: Inspector,
  generateObject: (args: TArgs) => Promise<TResult>,
  options: AiSdkWrapperOptions = {},
): (args: TArgs) => Promise<TResult> {
  return wrapGenerateText(inspector, generateObject, {
    ...options,
    name: options.name ?? "generateObject",
    operation: options.operation ?? "generateObject",
    traceName: options.traceName ?? "ai-sdk",
  });
}

function embeddingDimensions(result: UnknownRecord): number | undefined {
  const embeddings = result.embeddings;
  if (Array.isArray(embeddings) && embeddings.length > 0) {
    const first = embeddings[0];
    if (Array.isArray(first)) return first.length;
  }
  return undefined;
}

export function wrapEmbed<TArgs, TResult>(
  inspector: Inspector,
  embed: (args: TArgs) => Promise<TResult>,
  options: AiSdkWrapperOptions = {},
): (args: TArgs) => Promise<TResult> {
  return async function instrumentedEmbed(this: unknown, args: TArgs): Promise<TResult> {
    const operation = options.operation ?? "embed";
    const { trace, span, ownsTrace, model, provider } = startGeneration(
      inspector,
      operation,
      args,
      options,
      "embedding",
    );
    try {
      const result = await embed.call(this, args);
      const resultRecord = record(result);
      const embeddings = Array.isArray(resultRecord.embeddings)
        ? resultRecord.embeddings
        : [];
      const dimensions = embeddingDimensions(resultRecord);
      const rawUsage = record(resultRecord.usage);
      const tokens =
        numberValue(rawUsage.tokens) ??
        numberValue(rawUsage.inputTokens) ??
        numberValue(rawUsage.promptTokens);
      span.end({
        output: {
          count: embeddings.length,
          ...(dimensions !== undefined ? { dimensions } : {}),
        },
        ...(tokens !== undefined
          ? { usage: { inputTokens: tokens, outputTokens: 0 } }
          : {}),
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
      });
      finishOwned(trace, ownsTrace);
      return result;
    } catch (error) {
      span.fail(error);
      finishOwned(trace, ownsTrace, error);
      throw error;
    }
  };
}

export function wrapEmbedMany<TArgs, TResult>(
  inspector: Inspector,
  embedMany: (args: TArgs) => Promise<TResult>,
  options: AiSdkWrapperOptions = {},
): (args: TArgs) => Promise<TResult> {
  return wrapEmbed(inspector, embedMany, {
    ...options,
    name: options.name ?? "embedMany",
    operation: options.operation ?? "embedMany",
  });
}

export function wrapStreamText<TArgs, TResult>(
  inspector: Inspector,
  streamText: (args: TArgs) => TResult,
  options: AiSdkWrapperOptions = {},
): (args: TArgs) => TResult {
  return function instrumentedStreamText(this: unknown, args: TArgs): TResult {
    const operation = options.operation ?? "streamText";
    const { trace, span, ownsTrace, model, provider } = startGeneration(
      inspector,
      operation,
      args,
      options,
      "generation",
    );

    let chunks = "";
    let finished = false;

    async function finishFromResult(completed: boolean): Promise<void> {
      if (finished) return;
      finished = true;
      const resultRecord = record(result);
      try {
        if (completed) {
          const usage = await Promise.resolve(resultRecord.usage).catch(() => undefined);
          const response = await Promise.resolve(resultRecord.response).catch(() => undefined);
          const responseRecord = record(response);
          const text = chunks || (await Promise.resolve(resultRecord.text).catch(() => ""));
          span.end({
            ...(text ? { output: { text } } : {}),
            usage: mapAiSdkUsage(usage),
            ...(typeof responseRecord.modelId === "string"
              ? { model: responseRecord.modelId }
              : model
                ? { model }
                : {}),
            ...(provider ? { provider } : {}),
          });
        } else {
          span.end({
            ...(chunks ? { output: { text: chunks } } : {}),
            attributes: { "ai.stream_incomplete": true },
          });
        }
        finishOwned(trace, ownsTrace);
      } catch (error) {
        span.fail(error);
        finishOwned(trace, ownsTrace, error);
      }
    }

    function fail(error: unknown): void {
      if (finished) return;
      finished = true;
      span.fail(error);
      finishOwned(trace, ownsTrace, error);
    }

    let result: unknown;

    try {
      result = streamText.call(this, args);
    } catch (error) {
      fail(error);
      throw error;
    }

    let textStream: AsyncIterable<unknown> | undefined;
    let fullStream: AsyncIterable<unknown> | undefined;
    let wrappedText: AsyncIterable<unknown> | undefined;
    let wrappedFull: AsyncIterable<unknown> | undefined;

    const onText = (text: string) => {
      if (!text) return;
      span.markFirstToken();
      chunks += text;
    };

    async function* instrumentTextStream(
      stream: AsyncIterable<unknown>,
    ): AsyncGenerator<unknown> {
      let completed = false;
      try {
        for await (const chunk of stream) {
          if (typeof chunk === "string") onText(chunk);
          yield chunk;
        }
        completed = true;
      } catch (error) {
        fail(error);
        throw error;
      } finally {
        if (!finished) await finishFromResult(completed);
      }
    }

    async function* instrumentFullStream(
      stream: AsyncIterable<unknown>,
    ): AsyncGenerator<unknown> {
      let completed = false;
      try {
        for await (const chunk of stream) {
          const part = record(chunk);
          if (part.type === "text-delta") {
            const text = typeof part.text === "string" ? part.text : part.textDelta;
            if (typeof text === "string") onText(text);
          } else if (part.type === "error") {
            fail(part.error);
          }
          yield chunk;
        }
        completed = true;
      } catch (error) {
        fail(error);
        throw error;
      } finally {
        if (!finished) await finishFromResult(completed);
      }
    }

    return new Proxy(result as object, {
      get(target, property, receiver) {
        if (property === "textStream") {
          if (!textStream) {
            const source = Reflect.get(target, property, receiver);
            if (isAsyncIterable(source)) textStream = source;
          }
          if (textStream) {
            wrappedText ??= instrumentTextStream(textStream);
            return wrappedText;
          }
        }
        if (property === "fullStream") {
          if (!fullStream) {
            const source = Reflect.get(target, property, receiver);
            if (isAsyncIterable(source)) fullStream = source;
          }
          if (fullStream) {
            wrappedFull ??= instrumentFullStream(fullStream);
            return wrappedFull;
          }
        }
        if (property === "consumeStream") {
          const consume = Reflect.get(target, property, receiver);
          if (typeof consume === "function") {
            return async (...consumeArgs: unknown[]) => {
              try {
                const value = await consume.apply(target, consumeArgs);
                await finishFromResult(true);
                return value;
              } catch (error) {
                fail(error);
                throw error;
              }
            };
          }
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as TResult;
  };
}

export interface AiSdkModule {
  generateText?: AiSdkGenerateTextFn;
  streamText?: AiSdkStreamTextFn;
  generateObject?: AiSdkGenerateObjectFn;
  embed?: AiSdkEmbedFn;
  embedMany?: AiSdkEmbedManyFn;
  [key: string]: unknown;
}

export type AiSdkGenerateTextFn = (
  args: AiSdkGenerateTextArgs,
) => Promise<AiSdkGenerateTextResult>;
export type AiSdkStreamTextFn = (
  args: AiSdkGenerateTextArgs,
) => AiSdkStreamTextResult;
export type AiSdkGenerateObjectFn = (
  args: AiSdkGenerateObjectArgs,
) => Promise<AiSdkGenerateObjectResult>;
export type AiSdkEmbedFn = (
  args: AiSdkEmbedArgs,
) => Promise<AiSdkEmbedResult>;
export type AiSdkEmbedManyFn = (
  args: AiSdkEmbedManyArgs,
) => Promise<AiSdkEmbedManyResult>;

export interface AiSdkGenerateTextArgs {
  model: unknown;
  prompt: string;
  tools?: unknown[];
  maxTokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

export interface AiSdkGenerateTextResult {
  text?: string;
  object?: unknown;
  toolCalls?: Array<{
    toolName?: string;
    toolCallId?: string;
    input?: unknown;
    args?: unknown;
  }>;
  toolResults?: Array<{
    toolCallId?: string;
    output?: unknown;
    result?: unknown;
  }>;
  usage?: unknown;
  response?: {
    modelId?: string;
  };
  finishReason?: string;
  [key: string]: unknown;
}

export interface AiSdkStreamTextResult {
  textStream?: AsyncIterable<string | unknown>;
  fullStream?: AsyncIterable<unknown>;
  consumeStream?: () => Promise<unknown>;
  text?: string | Promise<string>;
  usage?: unknown | Promise<unknown>;
  response?: unknown | Promise<unknown>;
  [key: string]: unknown;
}

export interface AiSdkGenerateObjectArgs {
  model: unknown;
  schema: unknown;
  prompt?: string;
  [key: string]: unknown;
}

export interface AiSdkGenerateObjectResult {
  object?: unknown;
  usage?: unknown;
  response?: {
    modelId?: string;
  };
  [key: string]: unknown;
}

export interface AiSdkEmbedArgs {
  model: unknown;
  value: string | unknown[];
  [key: string]: unknown;
}

export interface AiSdkEmbedResult {
  embeddings?: unknown[];
  usage?: unknown;
  [key: string]: unknown;
}

export interface AiSdkEmbedManyArgs {
  model: unknown;
  values: (string | unknown[])[];
  [key: string]: unknown;
}

export interface AiSdkEmbedManyResult {
  embeddings?: unknown[];
  usage?: unknown;
  [key: string]: unknown;
}

/**
 * Returns wrapped versions of the AI SDK functions you pass in. Nothing is
 * installed globally. The SDK functions you pass in are typed as broadly as
 * possible because their public API surface is not part of this package's
 * contract.
 */
export function instrumentAiSdk<T extends AiSdkModule>(
  inspector: Inspector,
  sdk: T,
  options: AiSdkWrapperOptions = {},
): T {
  const output: AiSdkModule = { ...sdk };
  if (typeof sdk.generateText === "function") {
    output.generateText = wrapGenerateText(
      inspector,
      sdk.generateText as AiSdkGenerateTextFn,
      options,
    ) as T["generateText"];
  }
  if (typeof sdk.streamText === "function") {
    output.streamText = wrapStreamText(
      inspector,
      sdk.streamText as AiSdkStreamTextFn,
      options,
    ) as T["streamText"];
  }
  if (typeof sdk.generateObject === "function") {
    output.generateObject = wrapGenerateObject(
      inspector,
      sdk.generateObject as AiSdkGenerateObjectFn,
      options,
    ) as T["generateObject"];
  }
  if (typeof sdk.embed === "function") {
    output.embed = wrapEmbed(
      inspector,
      sdk.embed as AiSdkEmbedFn,
      options,
    ) as T["embed"];
  }
  if (typeof sdk.embedMany === "function") {
    output.embedMany = wrapEmbedMany(
      inspector,
      sdk.embedMany as AiSdkEmbedManyFn,
      options,
    ) as T["embedMany"];
  }
  return output as T;
}
