import { describe, expect, it } from "vitest";
import { generateCurl } from "../web/curl-generator";

describe("Curl Generator", () => {
  it("generates a valid curl command", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "Hello world");
    expect(result).toContain("curl -X POST");
    expect(result).toContain("https://discord.git.ci/api/webhook/123/token");
    expect(result).toContain("Content-Type: application/json");
    expect(result).toContain("Hello world");
  });

  it("escapes single quotes in content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "it's a test");
    expect(result).toContain("it\\'s a test");
  });

  it("handles multiline content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "line1\nline2");
    expect(result).toContain("line1\\nline2");
  });
});
