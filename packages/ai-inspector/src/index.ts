export { createInspector } from "./inspector.js";

export type {
  EndSpanPatch,
  EndTracePatch,
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

export type {
  Attributes,
  AttributeValue,
  Cost,
  EvaluationResult,
  Exporter,
  SerializedError,
  SpanData,
  SpanEvent,
  SpanKind,
  SpanStatus,
  ToolCall,
  TraceData,
  Usage,
} from "./types.js";

export { createSanitizer, toAttributeValue } from "./capture.js";
export type { CaptureMode, CaptureOptions, CaptureSanitizer } from "./capture.js";

export { createSyncContext, detectNodeContext } from "./context.js";
export type { ActiveScope, ContextManager } from "./context.js";

export { estimateCost, findPricing, builtInPricing } from "./pricing.js";
export type { ModelPricing, PricingMatch, PricingTable } from "./pricing.js";

export { MemoryExporter, memoryExporter } from "./exporters/memory.js";
export type { MemoryExporterOptions } from "./exporters/memory.js";

export {
  ConsoleExporter,
  consoleExporter,
  formatDuration,
  formatCost,
  formatTrace,
} from "./exporters/console.js";
export type { ConsoleExporterOptions } from "./exporters/console.js";

export { CompositeExporter, combineExporters } from "./exporters/combine.js";

export { runScorers, scorers } from "./evals.js";
export type { Scorer, ScorerContext, ScorerValue } from "./evals.js";

export { PACKAGE_NAME, VERSION } from "./version.js";
