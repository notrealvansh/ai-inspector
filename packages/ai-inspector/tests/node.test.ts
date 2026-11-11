import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { memoryExporter } from "../src/index.js";
import { createNodeInspector, jsonlFileExporter } from "../src/node/index.js";
import { sleep } from "./helpers.js";

describe("Node preset", () => {
  it("writes JSONL traces and creates the directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-inspector-"));
    const file = join(directory, "nested", "traces.ndjson");
    try {
      const inspector = createNodeInspector({ file });
      await inspector.trace("node-run", async (trace) => {
        const span = inspector.startSpan({ name: "inside", kind: "custom" });
        span.end();
        trace.setMetadata("runtime", "node");
      });
      await inspector.flush();

      const content = await readFile(file, "utf8");
      const record = JSON.parse(content.trim());
      expect(record.name).toBe("node-run");
      expect(record.metadata.runtime).toBe("node");
      expect(record.spans[0].name).toBe("inside");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps concurrent traces separate with AsyncLocalStorage", async () => {
    const memory = memoryExporter();
    const inspector = createNodeInspector({ file: false, exporters: [memory] });

    await Promise.all([
      inspector.trace("slow", async () => {
        await sleep(20);
        inspector.startSpan({ name: "slow-span" }).end();
      }),
      inspector.trace("fast", async () => {
        await sleep(1);
        inspector.startSpan({ name: "fast-span" }).end();
      }),
    ]);

    const traces = memory.getTraces();
    const slow = traces.find((trace) => trace.name === "slow");
    const fast = traces.find((trace) => trace.name === "fast");
    expect(slow?.spans.map((span) => span.name)).toEqual(["slow-span"]);
    expect(fast?.spans.map((span) => span.name)).toEqual(["fast-span"]);
  });

  it("can write to an explicit file without the preset", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ai-inspector-"));
    const file = join(directory, "custom.ndjson");
    try {
      const exporter = jsonlFileExporter({ file });
      const inspector = createNodeInspector({ file: false, exporters: [exporter] });
      inspector.startTrace({ name: "manual" }).end();
      await inspector.shutdown();
      const content = await readFile(file, "utf8");
      expect(JSON.parse(content.trim()).name).toBe("manual");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
