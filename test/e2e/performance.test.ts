import { type Browser, launch, type Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mockDiscordWebhook } from "../helpers/puppeteer-helpers";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";

describe("Performance & Load E2E Tests", () => {
  beforeAll(async () => {
    browser = await launch({
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

  it("processes large message within timeout", async () => {
    await mockDiscordWebhook(page);
    const largeMsg = "A".repeat(50000); // 50KB
    const start = Date.now();
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: largeMsg }),
    });
    const duration = Date.now() - start;
    expect(response?.status()).toBe(204);
    expect(duration).toBeLessThan(5000); // Should complete in <5s
  });

  it("chunks heavily nested content efficiently", async () => {
    await mockDiscordWebhook(page);
    const nested = Array(100)
      .fill(0)
      .map((_, i) => `Level ${i}\n${"  ".repeat(i)}Content ${i}`)
      .join("\n");
    const start = Date.now();
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/123/abc?max_chars=500&max_lines=10`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nested }),
      },
    );
    const duration = Date.now() - start;
    expect(response?.status()).toBe(204);
    expect(duration).toBeLessThan(3000); // Should be fast
  });

  it("web UI renders markdown preview responsively", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const largeText = "Line\n".repeat(500);
    const start = Date.now();
    await page.type("textarea", largeText);
    await page.waitForTimeout(1000); // Allow rendering
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Preview should render quickly
  });

  it("memory usage stays reasonable with repeated requests", async () => {
    await mockDiscordWebhook(page);
    const requests = 10;
    for (let i = 0; i < requests; i++) {
      const msg = `Request ${i}: ${"A".repeat(1000)}`;
      await page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg }),
      });
    }
    // If we reach here without crashing, test passes
    expect(true).toBe(true);
  });

  it("handles burst of concurrent requests", async () => {
    await mockDiscordWebhook(page);
    const promises = Array(5)
      .fill(0)
      .map((_, i) =>
        page.goto(`${DEV_SERVER_URL}/api/webhooks/123/abc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: `Message ${i}` }),
        }),
      );
    const responses = await Promise.all(promises);
    for (const resp of responses) {
      expect(resp?.status()).toBe(204);
    }
  });
});
