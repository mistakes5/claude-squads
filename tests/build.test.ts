import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..");

describe("Build", () => {
  it("should compile without errors", () => {
    // Run tsc --noEmit to type-check without producing output
    expect(() => {
      execSync("npx tsc --noEmit", { cwd: ROOT, stdio: "pipe" });
    }).not.toThrow();
  });

  it("should produce dist output with tsup", () => {
    execSync("pnpm build", { cwd: ROOT, stdio: "pipe", timeout: 60_000 });

    // Core outputs
    expect(existsSync(join(ROOT, "dist/squads.js"))).toBe(true);
    expect(existsSync(join(ROOT, "dist/watcher.js"))).toBe(true);
    expect(existsSync(join(ROOT, "dist/mcp-server.js"))).toBe(true);

    // Overlay outputs
    expect(existsSync(join(ROOT, "dist/overlay/main.cjs"))).toBe(true);
    expect(existsSync(join(ROOT, "dist/overlay/preload.cjs"))).toBe(true);
    expect(existsSync(join(ROOT, "dist/overlay/overlay.html"))).toBe(true);
  });
});
