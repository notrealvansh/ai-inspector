import { AsyncLocalStorage } from "node:async_hooks";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { ActiveScope, ContextManager } from "../context.js";
import { consoleExporter } from "../exporters/console.js";
import { createInspector } from "../inspector.js";
import type { Inspector, InspectorOptions } from "../api.js";
import type { Exporter, TraceData } from "../types.js";

export function createNodeContext(): ContextManager {
  const storage = new AsyncLocalStorage<ActiveScope>();
  return {
    run(scope, fn) {
      return storage.run(scope, fn);
    },
    active() {
      return storage.getStore();
    },
  };
}

export interface JsonlFileExporterOptions {
  /** Defaults to `.ai-inspector/traces.ndjson` in the current directory. */
  file?: string;
}

/**
 * Appends one JSON trace per line. Writes are serialized so concurrent traces
 * cannot interleave partial lines.
 */
export class JsonlFileExporter implements Exporter {
  readonly name = "jsonl-file";
  readonly file: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(options: JsonlFileExporterOptions = {}) {
    this.file = resolve(process.cwd(), options.file ?? ".ai-inspector/traces.ndjson");
  }

  exportTrace(trace: TraceData): Promise<void> {
    const line = `${JSON.stringify(trace)}\n`;
    const write = this.queue.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await appendFile(this.file, line, "utf8");
    });
    this.queue = write.catch(() => undefined);
    return write;
  }

  flush(): Promise<void> {
    return this.queue;
  }
}

export function jsonlFileExporter(
  options: JsonlFileExporterOptions = {},
): JsonlFileExporter {
  return new JsonlFileExporter(options);
}

export interface NodeInspectorOptions extends InspectorOptions {
  /**
   * Where traces are written. Defaults to `.ai-inspector/traces.ndjson`.
   * Pass false to disable file output.
   */
  file?: string | false;
  /** Also print a compact trace summary. Defaults to false. */
  console?: boolean;
}

/**
 * Node preset with async context propagation and a local NDJSON file.
 * No account, API key, or network call is involved.
 */
export function createNodeInspector(
  options: NodeInspectorOptions = {},
): Inspector {
  const exporters: Exporter[] = [];
  if (options.file !== false) {
    exporters.push(jsonlFileExporter({ file: options.file }));
  }
  if (options.console) exporters.push(consoleExporter());
  if (options.exporters) exporters.push(...options.exporters);

  return createInspector({
    ...options,
    context: options.context ?? createNodeContext(),
    exporters,
  });
}
