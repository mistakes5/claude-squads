import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { main: "src/overlay/main.ts" },
    format: "cjs",
    target: "node18",
    platform: "node",
    outDir: "dist/overlay",
    external: ["electron"],
    sourcemap: true,
  },
  {
    entry: { preload: "src/overlay/preload.ts" },
    format: "cjs",
    target: "node18",
    platform: "node",
    outDir: "dist/overlay",
    external: ["electron"],
    sourcemap: true,
  },
]);
