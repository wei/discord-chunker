import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mockDiscordWebhook } from "../helpers/puppeteer-helpers";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";
const TEST_WEBHOOK_ID = "123456789";
const TEST_WEBHOOK_TOKEN = "abcdefghijklmnop";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Webhook Proxy E2E Tests", () => {
  beforeAll(async () => {
    const { launch } = await import("puppeteer");
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

  it("proxies short messages without chunking", async () => {
    await mockDiscordWebhook(page);
    const shortMsg = "Hello world";
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: shortMsg }),
      } as never,
    );
    expect(response?.status()).toBe(204);
  });

  it("chunks messages exceeding max_chars", async () => {
    await mockDiscordWebhook(page);
    const longMsg = "A".repeat(2500);
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}?max_chars=1000`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: longMsg }),
      } as never,
    );
    expect(response?.status()).toBe(204);
  });

  it("respects max_lines parameter", async () => {
    await mockDiscordWebhook(page);
    const multiLine = Array(30).fill("line").join("\n");
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}?max_lines=10`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: multiLine }),
      } as never,
    );
    expect(response?.status()).toBe(204);
  });

  it("preserves code fence markers across chunks", async () => {
    await mockDiscordWebhook(page);
    const codeBlock = `\`\`\`js\n${"A".repeat(500)}\n\`\`\``;
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}?max_chars=300`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: codeBlock }),
      } as never,
    );
    expect(response?.status()).toBe(204);
  });

  it("handles wait=true parameter", async () => {
    await mockDiscordWebhook(page, {
      body: { id: "msg123", type: 0, content: "ok" },
    });
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}?wait=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      } as never,
    );
    expect(response?.status()).toBe(200);
  });

  it("rejects oversized payloads (>100KB)", async () => {
    const oversizedMsg = "A".repeat(102400);
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: oversizedMsg }),
      } as never,
    );
    expect(response?.status()).toBe(413);
  });

  it("validates incorrect content-type", async () => {
    const response = await page.goto(
      `${DEV_SERVER_URL}/api/webhooks/${TEST_WEBHOOK_ID}/${TEST_WEBHOOK_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "test",
      } as never,
    );
    expect(response?.status()).toBe(415);
  });

  it("returns 404 for invalid webhook path", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/api/webhooks/invalid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "test" }),
    } as never);
    expect(response?.status()).toBe(404);
  });

  it("health endpoint returns service info", async () => {
    const response = await page.goto(`${DEV_SERVER_URL}/health`);
    expect(response?.status()).toBe(200);
    const json = await response?.json();
    expect((json as { service?: string })?.service).toBe("discord-chunker");
    expect((json as { status?: string })?.status).toBe("ok");
  });
});
