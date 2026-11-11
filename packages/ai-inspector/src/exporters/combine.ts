import type { Exporter, TraceData } from "../types.js";

/** Sends each trace to every exporter, even if one of them fails. */
export class CompositeExporter implements Exporter {
  readonly name = "composite";
  private readonly exporters: Exporter[];

  constructor(exporters: Exporter[]) {
    this.exporters = exporters;
  }

  async exportTrace(trace: TraceData): Promise<void> {
    let firstError: unknown;
    for (const exporter of this.exporters) {
      try {
        await exporter.exportTrace(trace);
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  async flush(): Promise<void> {
    let firstError: unknown;
    for (const exporter of this.exporters) {
      try {
        await exporter.flush?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  async shutdown(): Promise<void> {
    let firstError: unknown;
    for (const exporter of this.exporters) {
      try {
        await exporter.shutdown?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }
}

export function combineExporters(...exporters: Exporter[]): CompositeExporter {
  return new CompositeExporter(exporters);
}
