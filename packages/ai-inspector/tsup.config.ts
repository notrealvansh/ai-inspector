import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "node/index": "src/node/index.ts",
    "otel/index": "src/otel/index.ts",
    "ai-sdk/index": "src/ai-sdk/index.ts",
    "openai/index": "src/openai/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  target: "node18",
  platform: "node",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
