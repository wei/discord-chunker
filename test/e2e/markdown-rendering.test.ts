import type { Browser, Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { takeScreenshot } from "../helpers/puppeteer-helpers";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = "http://localhost:8787";
const e2eDescribe = process.env.RUN_E2E ? describe : describe.skip;

e2eDescribe("Markdown Rendering E2E Tests", () => {
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

  it("renders headings correctly", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "# H1\n## H2\n### H3");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<h1>");
    expect(html).toContain("<h2>");
    expect(html).toContain("<h3>");
  });

  it("renders bold and italic text", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "**bold** and *italic* and ***both***");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
  });

  it("renders code blocks with fence", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "```typescript\nconst x = 1;\n```");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<code>");
  });

  it("renders links", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "[Discord](https://discord.com)");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<a");
    expect(html).toContain("discord.com");
  });

  it("renders bullet lists", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "- Item 1\n- Item 2\n- Item 3");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>");
  });

  it("renders numbered lists", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "1. First\n2. Second\n3. Third");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<ol>");
  });

  it("renders blockquotes", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "> Quote line 1\n> Quote line 2");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<blockquote>");
  });

  it("renders horizontal rules", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    await page.type("textarea", "Text above\n---\nText below");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html).toContain("<hr");
  });

  it("complex markdown renders without errors", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const complexMd = `
# Title
This is **bold** and *italic*.

\`\`\`js
console.log('code');
\`\`\`

- Item 1
- Item 2

> Quote

[Link](https://example.com)
`;
    await page.type("textarea", complexMd);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const preview = await page.$("#preview");
    expect(preview).toBeTruthy();
    const html = await page.$eval(
      "#preview",
      (el) => (el as unknown as { innerHTML: string }).innerHTML,
    );
    expect(html.length).toBeGreaterThan(0);
  });

  it("takes screenshot of rendered markdown", async () => {
    await page.goto(`${DEV_SERVER_URL}/chunker`, { waitUntil: "networkidle0" });
    const md = "# Heading\n\n**Bold text** and *italic* with [link](https://example.com)";
    await page.type("textarea", md);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await takeScreenshot(page, "markdown-render-example");
  });
});
