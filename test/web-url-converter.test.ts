import { describe, expect, it } from "vitest";
import { convertWebhookUrl, extractWebhookParts, isValidWebhookUrl } from "../web/url-converter";

const ORIGIN = "https://discord.git.ci";

describe("URL Converter", () => {
  it("converts discord.com webhook URL to proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input, ORIGIN);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("handles discordapp.com variant", () => {
    const input = "https://discordapp.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input, ORIGIN);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("returns null for invalid URLs", () => {
    expect(convertWebhookUrl("not a url", ORIGIN)).toBeNull();
    expect(convertWebhookUrl("https://google.com/webhooks/123/token", ORIGIN)).toBeNull();
    expect(convertWebhookUrl("", ORIGIN)).toBeNull();
  });

  it("validates webhook URLs", () => {
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/123/token")).toBe(true);
    expect(isValidWebhookUrl("https://not-discord.com/api/webhooks/123/token")).toBe(false);
    expect(isValidWebhookUrl("garbage")).toBe(false);
  });

  it("preserves query params", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true&thread_id=456";
    const result = convertWebhookUrl(input, ORIGIN);
    expect(result).toBe("https://discord.git.ci/api/webhook/123/token?wait=true&thread_id=456");
  });

  it("strips URL fragments", () => {
    const input = "https://discord.com/api/webhooks/123/token#fragment";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("strips fragments but keeps query params", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true#fragment";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("uses provided origin for proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123/token";
    expect(convertWebhookUrl(input, "http://localhost:8787")).toBe(
      "http://localhost:8787/api/webhook/123/token",
    );
  });
});

describe("extractWebhookParts", () => {
  it("extracts id, token, and search from webhook URL", () => {
    const result = extractWebhookParts(
      "https://discord.com/api/webhooks/123/mytoken?thread_id=456&wait=true",
    );
    expect(result).toEqual({
      id: "123",
      token: "mytoken",
      search: "?thread_id=456&wait=true",
    });
  });

  it("returns empty search when no query params", () => {
    const result = extractWebhookParts("https://discord.com/api/webhooks/123/mytoken");
    expect(result).toEqual({ id: "123", token: "mytoken", search: "" });
  });

  it("returns null for invalid URLs", () => {
    expect(extractWebhookParts("not a url")).toBeNull();
    expect(extractWebhookParts("https://example.com/other/path")).toBeNull();
  });

  it("rejects non-Discord hostnames", () => {
    expect(extractWebhookParts("https://evil.com/api/webhooks/123/token")).toBeNull();
    expect(extractWebhookParts("https://discord.com.evil.com/api/webhooks/123/token")).toBeNull();
  });

  it("accepts discordapp.com hostname", () => {
    const result = extractWebhookParts("https://discordapp.com/api/webhooks/123/mytoken");
    expect(result).toEqual({ id: "123", token: "mytoken", search: "" });
  });

  it("strips fragment from extracted parts", () => {
    const result = extractWebhookParts("https://discord.com/api/webhooks/123/mytoken#fragment");
    // URL constructor strips fragments from hash but they don't affect search
    expect(result).toEqual({ id: "123", token: "mytoken", search: "" });
  });

  it("strips fragment but preserves query in extracted parts", () => {
    const result = extractWebhookParts(
      "https://discord.com/api/webhooks/123/mytoken?wait=true#fragment",
    );
    expect(result).toEqual({ id: "123", token: "mytoken", search: "?wait=true" });
  });
});
