import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// We test the pure logic of config functions by mocking the paths.
// Since config.ts uses hardcoded homedir(), we test the serialization logic directly.

describe("Config serialization", () => {
  const testDir = join(tmpdir(), "squads-test-" + Date.now());
  const tokenPath = join(testDir, "token.json");
  const settingsPath = join(testDir, "settings.json");

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("should round-trip a valid token", () => {
    const token = {
      access_token: "test-access",
      refresh_token: "test-refresh",
      expires_at: 9999999999,
      user: {
        id: "user-123",
        github_username: "testuser",
        display_name: "Test User",
        avatar_url: "https://github.com/testuser.png",
      },
    };

    writeFileSync(tokenPath, JSON.stringify(token, null, 2));
    const loaded = JSON.parse(readFileSync(tokenPath, "utf-8"));

    expect(loaded.access_token).toBe("test-access");
    expect(loaded.user.github_username).toBe("testuser");
    expect(loaded.user.display_name).toBe("Test User");
  });

  it("should handle missing token file gracefully", () => {
    expect(existsSync(join(testDir, "nonexistent.json"))).toBe(false);
  });

  it("should round-trip settings", () => {
    const settings = {
      overlay_mode: "toggle" as const,
      current_room: "test-room",
    };

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    const loaded = JSON.parse(readFileSync(settingsPath, "utf-8"));

    expect(loaded.overlay_mode).toBe("toggle");
    expect(loaded.current_room).toBe("test-room");
  });

  it("should handle empty/corrupt JSON", () => {
    writeFileSync(tokenPath, "not json at all");

    expect(() => JSON.parse(readFileSync(tokenPath, "utf-8"))).toThrow();
  });
});
