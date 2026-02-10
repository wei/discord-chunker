import { describe, expect, it } from "vitest";
import { convertWebhookUrl, isValidWebhookUrl } from "../web/url-converter";

describe("URL Converter", () => {
  it("converts discord.com webhook URL to proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("handles discordapp.com variant", () => {
    const input = "https://discordapp.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("returns null for invalid URLs", () => {
    expect(convertWebhookUrl("not a url")).toBeNull();
    expect(convertWebhookUrl("https://google.com/webhooks/123/token")).toBeNull();
    expect(convertWebhookUrl("")).toBeNull();
  });

  it("validates webhook URLs", () => {
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/123/token")).toBe(true);
    expect(isValidWebhookUrl("https://not-discord.com/api/webhooks/123/token")).toBe(false);
    expect(isValidWebhookUrl("garbage")).toBe(false);
  });

  it("preserves query params", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true&thread_id=456";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123/token?wait=true&thread_id=456");
  });
});
