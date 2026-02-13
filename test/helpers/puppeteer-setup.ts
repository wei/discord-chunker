import { type Browser, launch, type Page } from "puppeteer";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";

let browser: Browser;
let page: Page;
const DEV_SERVER_URL = process.env.DEV_SERVER_URL || "http://localhost:8787";

export const setupBrowser = () => {
  beforeAll(async () => {
    browser = await launch({
      headless: process.env.HEADLESS !== "false",
      args: ["--disable-dev-shm-usage"],
    });
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  beforeEach(async () => {
    page = await browser.newPage();
    // Mock Discord API
    await page.on("request", async (request) => {
      if (request.url().includes("discord.com")) {
        await request.respond({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: `msg-${Date.now()}`,
            type: 0,
            content: "ok",
          }),
        });
      }
    });
  });

  afterEach(async () => {
    if (page) {
      await page.close();
    }
  });

  return { getPage: () => page, getBrowser: () => browser, getServerUrl: () => DEV_SERVER_URL };
};
