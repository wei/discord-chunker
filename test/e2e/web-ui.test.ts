import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { takeScreenshot, waitForElement } from "../helpers/puppeteer-helpers";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Web UI E2E Tests", () => {
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
    await page.setViewport({ width: 1280, height: 720 });
  });

  afterEach(async () => {
    if (page) await page.close();
  });

  it("loads the chunker UI successfully", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const title = await page.title();
    expect(title).toContain("Chunker");
  });

  it("displays the webhook URL input field", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const webhookInput = await waitForElement(page, 'input[placeholder*="webhook"]');
    expect(webhookInput).toBeTruthy();
  });

  it("accepts and displays webhook URL", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const testUrl = "https://discord.com/api/webhooks/123456789/abcdefg";
    await page.type('input[placeholder*="webhook"]', testUrl);
    const value = await page.$eval(
      'input[placeholder*="webhook"]',
      (el) => (el as { value: string }).value,
    );
    expect(value).toBe(testUrl);
  });

  it("displays message input textarea", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const textarea = await waitForElement(page, "textarea");
    expect(textarea).toBeTruthy();
  });

  it("shows copy-to-clipboard button for generated curl command", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type('input[placeholder*="webhook"]', "https://discord.com/api/webhooks/123/abc");
    await page.type("textarea", "Test message");
    const copyButton = await waitForElement(page, 'button:contains("Copy")');
    expect(copyButton).toBeTruthy();
  });

  it("renders markdown preview in real browser", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "# Heading\n**bold** *italic*");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("<strong>");
  });

  it("updates chunk visualization on max_chars change", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const longText = "A".repeat(2500);
    await page.type("textarea", longText);
    await page.type('input[name="max_chars"]', "1000", { delay: 10 });
    await new Promise((resolve) => setTimeout(resolve, 500));
    const chunkCount = await page.$$eval(".chunk-item", (items) => items.length);
    expect(chunkCount).toBeGreaterThan(1);
  });

  it("displays error for invalid webhook URL", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type('input[placeholder*="webhook"]', "not-a-valid-url");
    await page.type("textarea", "test");
    await new Promise((resolve) => setTimeout(resolve, 300));
    const errorMsg = await waitForElement(page, ".error-message");
    expect(errorMsg).toBeTruthy();
  });

  it("validates max_chars range (100-2000)", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.evaluate(() => {
      const el = (
        globalThis as unknown as {
          document: {
            querySelector: (
              selector: string,
            ) => { value: string; dispatchEvent: (event: unknown) => void } | null;
          };
        }
      ).document.querySelector('input[name="max_chars"]');
      if (el) {
        el.value = "50";
        el.dispatchEvent({ type: "change" });
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const validation = await page.$eval('input[name="max_chars"]', (el) => {
      return (el as { validationMessage: string }).validationMessage;
    });
    expect(validation.length).toBeGreaterThan(0);
  });

  it("takes screenshot for visual regression", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type('input[placeholder*="webhook"]', "https://discord.com/api/webhooks/123/abc");
    await page.type("textarea", `# Test\n\nLong message body ${"x".repeat(500)}`);
    await takeScreenshot(page, "web-ui-filled");
  });
});
