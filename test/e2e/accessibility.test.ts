import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let browser: Browser;
let page: Page;
let AxePuppeteerCtor: new (
  page: Page,
) => { analyze: () => Promise<{ violations: Array<{ id: string }> }> };
const DEV_SERVER_URL = "http://localhost:8787";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Accessibility E2E Tests", () => {
  beforeAll(async () => {
    const puppeteer = await import("puppeteer");
    const axePuppeteer = await import("@axe-core/puppeteer");
    AxePuppeteerCtor = axePuppeteer.AxePuppeteer as unknown as new (
      page: Page,
    ) => {
      analyze: () => Promise<{ violations: Array<{ id: string }> }>;
    };
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

  it("web UI has no axe violations", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const results = await new AxePuppeteerCtor(page).analyze();
    expect(results.violations).toEqual([]);
  });

  it("form inputs have accessible labels", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const inputs = await page.$$("input, textarea");
    for (const input of inputs) {
      const label = await input.evaluate((el) => {
        const ariaLabel = (el as { ariaLabel?: string }).ariaLabel;
        const doc = (
          globalThis as unknown as {
            document: { querySelector: (selector: string) => { textContent?: string } | null };
          }
        ).document;
        const forId = (el as { id?: string }).id ?? "";
        const associated = doc.querySelector(`label[for="${forId}"]`)?.textContent;
        return ariaLabel || associated;
      });
      expect(label).toBeTruthy();
    }
  });

  it("buttons have text or aria-label", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const buttons = await page.$$("button");
    for (const button of buttons) {
      const text = await button.evaluate((el) => {
        return (el as { ariaLabel?: string; textContent?: string }).ariaLabel || el.textContent;
      });
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  it("headings hierarchy is valid", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const headings = await page.$$eval("h1, h2, h3, h4, h5, h6", (elements) =>
      elements.map((el) => el.tagName),
    );
    let lastLevel = 0;
    for (const heading of headings) {
      const level = Number.parseInt(heading[1] ?? "0", 10);
      expect(level - lastLevel).toBeLessThanOrEqual(1);
      lastLevel = level;
    }
  });

  it("color contrast meets WCAG AA standards", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const results = await new AxePuppeteerCtor(page).analyze();
    const contrastViolations = results.violations.filter((v) => v.id.includes("color-contrast"));
    expect(contrastViolations).toEqual([]);
  });

  it("keyboard navigation is functional", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => {
      return (globalThis as unknown as { document: { activeElement?: { tagName?: string } } })
        .document.activeElement?.tagName;
    });
    expect(["INPUT", "BUTTON", "TEXTAREA"]).toContain(focused);
  });
});
