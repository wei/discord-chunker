import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDiscordUrl, sendChunks, validateContentType } from "../src/discord";

describe("buildDiscordUrl", () => {
  it("builds basic URL without params", () => {
    const url = buildDiscordUrl("123", "token");
    expect(url).toBe("https://discord.com/api/webhooks/123/token");
  });

  it("adds wait=true", () => {
    const url = buildDiscordUrl("123", "token", undefined, true);
    expect(url).toContain("wait=true");
  });

  it("adds thread_id", () => {
    const url = buildDiscordUrl("123", "token", "999");
    expect(url).toContain("thread_id=999");
  });

  it("adds both wait and thread_id", () => {
    const url = buildDiscordUrl("123", "token", "999", true);
    expect(url).toContain("wait=true");
    expect(url).toContain("thread_id=999");
  });

  it("omits wait when undefined", () => {
    const url = buildDiscordUrl("123", "token");
    expect(url).not.toContain("wait");
  });
});

describe("validateContentType", () => {
  it("returns json for application/json", () => {
    expect(validateContentType("application/json")).toBe("json");
  });

  it("returns json for application/json with charset", () => {
    expect(validateContentType("application/json; charset=utf-8")).toBe("json");
  });

  it("returns multipart for multipart/form-data", () => {
    expect(validateContentType("multipart/form-data; boundary=---")).toBe("multipart");
  });

  it("returns null for unsupported type", () => {
    expect(validateContentType("application/x-www-form-urlencoded")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateContentType("")).toBeNull();
  });
});
