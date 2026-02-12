import { describe, expect, it } from "vitest";
import { WEBHOOK_URL_PATTERN } from "../web/webhook-pattern";

describe("WEBHOOK_URL_PATTERN", () => {
  it("is valid with the browser's HTML pattern `v` flag", () => {
    const regex = new RegExp(`^(?:${WEBHOOK_URL_PATTERN})$`, "v");

    expect(regex.test("https://discord.com/api/webhooks/123/token")).toBe(true);
    expect(regex.test("https://discordapp.com/api/webhooks/123/token?wait=true")).toBe(true);
    expect(regex.test("https://example.com/api/webhooks/123/token")).toBe(false);
    expect(regex.test("abc")).toBe(false);
  });
});
