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
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc?wait=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([400, 429, 502, 503]).toContain(status);
  });

  it("handles malformed JSON in body", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ invalid json }",
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect(status).toBe(400);
  });

  it("rejects POST to non-existent endpoints", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/nonexistent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect(status).toBe(404);
  });

  // --- Edge cases ---
  it("handles empty message content", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);
  });

  it("handles messages with only whitespace", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "   \n  \n  " }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);
  });

  it("handles messages with only code blocks", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "```\ncode\n```" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);
  });

  it("handles unicode and emoji in messages", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Hello 👋 🌍 你好 مرحبا" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);
  });

  it("handles messages with mixed line endings (CRLF, LF)", async () => {
    const mixed = "line1\r\nline2\nline3\r\n";
    const status = await page.evaluate(
      async (url: string, content: string) => {
        const res = await fetch(`${url}/api/webhooks/123/abc`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        return res.status;
      },
      DEV_SERVER_URL,
      mixed,
    );
    expect([200, 204]).toContain(status);
  });

  it("handles deeply nested code fences", async () => {
    const nested = "```\nouter\n```js\ninner\n```\n```";
    const status = await page.evaluate(
      async (url: string, content: string) => {
        const res = await fetch(`${url}/api/webhooks/123/abc?max_chars=50`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        return res.status;
      },
      DEV_SERVER_URL,
      nested,
    );
    expect([200, 204, 400]).toContain(status);
  });

  it("handles max_chars at boundary values", async () => {
    // Test min boundary (100)
    let status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc?max_chars=100`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "A".repeat(150) }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);

    // Test max boundary (2000)
    status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc?max_chars=2000`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "A".repeat(2500) }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect([200, 204]).toContain(status);
  });

  it("rejects invalid max_chars values", async () => {
    const status = await page.evaluate(async (url: string) => {
      const res = await fetch(`${url}/api/webhooks/123/abc?max_chars=50`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "test" }),
      });
      return res.status;
    }, DEV_SERVER_URL);
    expect(status).toBe(400);
  });
});
