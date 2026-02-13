import { describe, expect, it } from "vitest";
import { convertWebhookUrl, extractWebhookParts, isValidWebhookUrl } from "../../web/url-converter";
import { WEBHOOK_URL_PATTERN } from "../../web/webhook-pattern";

const ORIGIN = "https://discord.git.ci";

describe("URL Converter", () => {
  it("converts discord.com webhook URL to proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input, ORIGIN);
    expect(result).toBe("https://discord.git.ci/api/webhooks/123456/abctoken");
  });

  it("handles discordapp.com variant", () => {
    const input = "https://discordapp.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input, ORIGIN);
    expect(result).toBe("https://discord.git.ci/api/webhooks/123456/abctoken");
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
    expect(result).toBe("https://discord.git.ci/api/webhooks/123/token?wait=true&thread_id=456");
  });

  it("rejects URL fragments", () => {
    const input = "https://discord.com/api/webhooks/123/token#fragment";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("rejects fragments even when query params are present", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true#fragment";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("rejects whitespace in token", () => {
    const input = "https://discord.com/api/webhooks/123/my token";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("rejects whitespace in query", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true and_more";
    expect(isValidWebhookUrl(input)).toBe(false);
    expect(convertWebhookUrl(input, ORIGIN)).toBeNull();
  });

  it("uses provided origin for proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123/token";
    expect(convertWebhookUrl(input, "http://localhost:8787")).toBe(
      "http://localhost:8787/api/webhooks/123/token",
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

  it("rejects fragment URLs to match converter and HTML validation", () => {
    const result = extractWebhookParts("https://discord.com/api/webhooks/123/mytoken#fragment");
    expect(result).toBeNull();
  });

  it("rejects fragments even when query params are present", () => {
    const result = extractWebhookParts(
      "https://discord.com/api/webhooks/123/mytoken?wait=true#fragment",
    );
    expect(result).toBeNull();
  });

  it("rejects uppercase hostnames to match converter and HTML validation", () => {
    const result = extractWebhookParts("https://DISCORD.COM/api/webhooks/123/mytoken");
    expect(result).toBeNull();
  });

  it("rejects whitespace in token", () => {
    const result = extractWebhookParts("https://discord.com/api/webhooks/123/my token");
    expect(result).toBeNull();
  });

  it("rejects whitespace in query", () => {
    const result = extractWebhookParts("https://discord.com/api/webhooks/123/mytoken?wait=true x");
    expect(result).toBeNull();
  });
});

describe("webhook URL validation parity", () => {
  const htmlPatternRegex = new RegExp(`^(?:${WEBHOOK_URL_PATTERN})$`, "v");

  const cases = [
    {
      label: "valid discord.com URL",
      input: "https://discord.com/api/webhooks/123/token",
      valid: true,
    },
    {
      label: "valid discordapp.com URL with query",
      input: "https://discordapp.com/api/webhooks/123/token?wait=true",
      valid: true,
    },
    {
      label: "uppercase host",
      input: "https://DISCORD.COM/api/webhooks/123/token",
      valid: false,
    },
    {
      label: "fragment",
      input: "https://discord.com/api/webhooks/123/token#fragment",
      valid: false,
    },
    {
      label: "query plus fragment",
      input: "https://discord.com/api/webhooks/123/token?wait=true#fragment",
      valid: false,
    },
    {
      label: "whitespace in token",
      input: "https://discord.com/api/webhooks/123/to ken",
      valid: false,
    },
    {
      label: "whitespace in query",
      input: "https://discord.com/api/webhooks/123/token?wait=true and_more",
      valid: false,
    },
  ] as const;

  for (const testCase of cases) {
    it(`keeps HTML pattern, converter, and send parser aligned for ${testCase.label}`, () => {
      const htmlValid = htmlPatternRegex.test(testCase.input);
      const converterValid = isValidWebhookUrl(testCase.input);
      const convertedUrl = convertWebhookUrl(testCase.input, ORIGIN);
      const parsed = extractWebhookParts(testCase.input);

      expect(htmlValid).toBe(testCase.valid);
      expect(converterValid).toBe(testCase.valid);
      expect(convertedUrl !== null).toBe(testCase.valid);
      expect(parsed !== null).toBe(testCase.valid);
    });
  }
});
