import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      jest: "src/jest.ts",
      vitest: "src/vitest.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    splitting: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ["openai", "@anthropic-ai/sdk"],
    esbuildOptions(options) {
      options.conditions = ["import", "require"];
    },
  },
]);
