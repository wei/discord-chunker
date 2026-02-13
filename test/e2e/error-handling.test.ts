import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Error Handling & Edge Case E2E Tests", () => {
  beforeAll(async () => {
    const puppeteer = await import("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--disable-dev-shm-usage"],
    });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  // --- Server errors ---
  it("handles Discord API errors gracefully", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    });
    expect([400, 429, 502, 503]).toContain(response?.status());
  });

  it("handles malformed JSON in body", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json }",
    });
    expect(response?.status()).toBe(400);
  });

  it("rejects POST to non-existent endpoints", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/nonexistent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    });
    expect(response?.status()).toBe(404);
  });

  // --- Edge cases ---
  it("handles empty message content", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("handles messages with only whitespace", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "   \n  \n  " }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("handles messages with only code blocks", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "```\ncode\n```" }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("handles unicode and emoji in messages", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "Hello 👋 🌍 你好 مرحبا" }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("handles messages with mixed line endings (CRLF, LF)", async () => {
    const mixed = "line1\r\nline2\nline3\r\n";
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: mixed }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("handles deeply nested code fences", async () => {
    const nested = "```\nouter\n```js\ninner\n```\n```";
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc?max_chars=50`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: nested }),
    });
    expect([200, 204, 400]).toContain(response?.status());
  });

  it("handles max_chars at boundary values", async () => {
    // Test min boundary (100)
    let response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc?max_chars=100`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "A".repeat(150) }),
    });
    expect([200, 204]).toContain(response?.status());

    // Test max boundary (2000)
    response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc?max_chars=2000`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "A".repeat(2500) }),
    });
    expect([200, 204]).toContain(response?.status());
  });

  it("rejects invalid max_chars values", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc?max_chars=50`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    });
    expect(response?.status()).toBe(400);
  });
});
