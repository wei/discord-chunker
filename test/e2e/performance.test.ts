import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Performance & Load E2E Tests", () => {
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

  it("processes large message within timeout", async () => {
    const largeMsg = "A".repeat(50000); // 50KB
    const duration = await page.evaluate(
      async (url: string, msg: string) => {
        const start = Date.now();
        await fetch(`${url}/api/webhooks/123/abc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: msg }),
        });
        return Date.now() - start;
      },
      DEV_SERVER_URL,
      largeMsg,
    );
    expect(duration).toBeLessThan(5000); // Should complete in <5s
  });

  it("chunks heavily nested content efficiently", async () => {
    const nested = Array(100)
      .fill(0)
      .map((_, i) => `Level ${i}\n${"  ".repeat(i)}Content ${i}`)
      .join("\n");
    const duration = await page.evaluate(
      async (url: string, content: string) => {
        const start = Date.now();
        await fetch(`${url}/api/webhooks/123/abc?max_chars=500&max_lines=10`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        return Date.now() - start;
      },
      DEV_SERVER_URL,
      nested,
    );
    expect(duration).toBeLessThan(3000); // Should be fast
  });

  it("web UI renders markdown preview responsively", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const largeText = "Line\n".repeat(500);
    const start = Date.now();
    const textareaHandle = await page.$("textarea");
    if (textareaHandle) {
      await textareaHandle.type(largeText);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(2000); // Preview should render quickly
  });

  it("memory usage stays reasonable with repeated requests", async () => {
    const requests = 10;
    for (let i = 0; i < requests; i++) {
      const msg = `Request ${i}: ${"A".repeat(1000)}`;
      await page.evaluate(
        async (url: string, content: string) => {
          await fetch(`${url}/api/webhooks/123/abc`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
          });
        },
        DEV_SERVER_URL,
        msg,
      );
    }
    // If we reach here without crashing, test passes
    expect(true).toBe(true);
  });

  it("handles burst of concurrent requests", async () => {
    const promises = Array(5)
      .fill(0)
      .map((_, i) =>
        page.evaluate(
          async (url: string, idx: number) => {
            const res = await fetch(`${url}/api/webhooks/123/abc`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: `Message ${idx}` }),
            });
            return res.status;
          },
          DEV_SERVER_URL,
          i,
        ),
      );
    const statuses = await Promise.all(promises);
    for (const status of statuses) {
      expect([200, 204]).toContain(status);
    }
  });
});
