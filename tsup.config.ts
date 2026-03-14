import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { "mcp-server": "src/mcp/server.ts" },
    format: "esm",
    target: "node18",
    platform: "node",
    outDir: "dist",
    clean: true,
    sourcemap: true,
  },
  {
    entry: { squads: "src/tui/cli.tsx" },
    format: "esm",
    target: "node18",
    platform: "node",
    outDir: "dist",
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
  },
  {
    entry: { watcher: "src/watcher.ts" },
    format: "esm",
    target: "node18",
    platform: "node",
    outDir: "dist",
    sourcemap: true,
  },
]);
