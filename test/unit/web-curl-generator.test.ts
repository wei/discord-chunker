import { describe, expect, it } from "vitest";
import { generateCurl } from "../../web/curl-generator";

describe("Curl Generator", () => {
  it("generates a valid curl command", () => {
    const result = generateCurl("https://discord.git.ci/api/webhooks/123/token", "Hello world");
    expect(result).toContain("curl -X POST");
    expect(result).toContain("https://discord.git.ci/api/webhooks/123/token");
    expect(result).toContain("Content-Type: application/json");
    expect(result).toContain('"content":"Hello world"');
  });

  it("escapes single quotes in content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhooks/123/token", "it's a test");
    // Single quotes are handled with the shell '\'' idiom
    expect(result).toContain("it'\\''s a test");
  });

  it("escapes single quotes in proxy URL", () => {
    const result = generateCurl("https://example.com/webhook/it's-me", "Hello world");
    // URL is single-quoted in shell, so embedded single quote must be escaped
    expect(result).toContain("curl -X POST 'https://example.com/webhook/it'\\''s-me'");
  });

  it("handles multiline content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhooks/123/token", "line1\nline2");
    // JSON.stringify escapes newlines as \n
    expect(result).toContain("line1\\nline2");
  });

  it("escapes double quotes in content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhooks/123/token", 'he said "hello"');
    // JSON.stringify properly escapes double quotes
    expect(result).toContain('\\"hello\\"');
  });
});
