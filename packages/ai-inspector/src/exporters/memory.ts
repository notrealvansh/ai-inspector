import type { Exporter, TraceData } from "../types.js";

export interface MemoryExporterOptions {
  /** Maximum number of traces kept. Oldest traces are dropped first. */
  capacity?: number;
}

type TraceListener = (trace: TraceData) => void;

export class MemoryExporter implements Exporter {
  readonly name = "memory";
  private readonly capacity: number;
  private traces: TraceData[] = [];
  private listeners = new Set<TraceListener>();

  constructor(options: MemoryExporterOptions = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity ?? 100));
  }

  exportTrace(trace: TraceData): void {
    this.traces.push(trace);
    if (this.traces.length > this.capacity) {
      this.traces.splice(0, this.traces.length - this.capacity);
    }
    for (const listener of this.listeners) {
      try {
        listener(trace);
      } catch {
        // A broken subscriber should never affect the instrumented app.
      }
    }
  }

  getTraces(): TraceData[] {
    return [...this.traces];
  }

  getTrace(id: string): TraceData | undefined {
    return this.traces.find((trace) => trace.id === id);
  }

  subscribe(listener: TraceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clear(): void {
    this.traces = [];
  }

  flush(): void {}
}

export function memoryExporter(options: MemoryExporterOptions = {}): MemoryExporter {
  return new MemoryExporter(options);
}
