import type { Page } from "puppeteer";

export async function fillForm(
  page: Page,
  _selectors: Record<string, string>,
  values: Record<string, string>,
) {
  for (const [selector, value] of Object.entries(values)) {
    await page.type(selector, value);
  }
}

export async function clickButton(page: Page, text: string) {
  const button = await page.$(`button::-p-text("${text}")`);
  if (!button) throw new Error(`Button not found: ${text}`);
  await button.click();
}

export async function waitForElement(page: Page, selector: string, timeout = 5000) {
  return page.waitForSelector(selector, { timeout });
}

export async function getTextContent(page: Page, selector: string) {
  return page.$eval(selector, (el) => el.textContent);
}

export async function takeScreenshot(page: Page, filename: string) {
  await page.screenshot({ path: `test/screenshots/${filename}.png`, fullPage: true });
}

export async function mockDiscordWebhook(page: Page, opts?: { status?: number; body?: unknown }) {
  await page.on("request", async (request) => {
    if (request.url().includes("discord.com/api/webhooks")) {
      await request.respond({
        status: opts?.status ?? 200,
        contentType: "application/json",
        body: JSON.stringify(
          opts?.body ?? {
            id: `msg-${Date.now()}`,
            type: 0,
            content: "Webhook response",
          },
        ),
      });
    }
  });
}
