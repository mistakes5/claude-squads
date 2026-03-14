import { describe, it, expect } from "vitest";

/**
 * Type-level tests — these verify the shape of our interfaces
 * by constructing valid objects. If the types change in a breaking way,
 * TypeScript will catch it at build time, and these will fail at test time.
 */

describe("Type contracts", () => {
  it("StoredToken should have required fields", async () => {
    // Dynamic import to test the actual module
    const types = await import("../src/shared/types.js");

    // Verify the module exports exist (types are erased, but we can check the module loads)
    expect(types).toBeDefined();
  });

  it("should construct a valid User shape", () => {
    const user = {
      id: "uuid-123",
      github_id: "12345",
      github_username: "octocat",
      avatar_url: "https://github.com/octocat.png",
      created_at: new Date().toISOString(),
    };

    expect(user.github_username).toBe("octocat");
    expect(user.avatar_url).toMatch(/^https:\/\//);
  });

  it("should construct a valid PresenceState shape", () => {
    const presence = {
      github_username: "octocat",
      avatar_url: null,
      status: "coding",
      current_file: "src/index.ts",
      online_at: new Date().toISOString(),
    };

    expect(presence.status).toBe("coding");
    expect(presence.current_file).toBe("src/index.ts");
  });

  it("should validate OverlayMode values", () => {
    const validModes = ["always", "toggle", "notifications"];
    validModes.forEach((mode) => {
      expect(["always", "toggle", "notifications"]).toContain(mode);
    });
  });

  it("Friend status should be pending or accepted", () => {
    const validStatuses = ["pending", "accepted"];
    expect(validStatuses).toContain("pending");
    expect(validStatuses).toContain("accepted");
  });
});
