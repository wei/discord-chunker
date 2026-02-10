// web/url-converter.ts
const WEBHOOK_REGEX =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/(\d+)\/([^/?]+)(.*)?$/;

export function isValidWebhookUrl(url: string): boolean {
  return WEBHOOK_REGEX.test(url);
}

export function convertWebhookUrl(url: string): string | null {
  const match = url.match(WEBHOOK_REGEX);
  if (!match) return null;
  const [, , id, token, rest] = match;
  return `https://discord.git.ci/api/webhook/${id}/${token}${rest || ""}`;
}

export function extractWebhookParts(
  url: string,
): { id: string; token: string; search: string } | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/api\/webhooks\/(\d+)\/([^/]+)$/);
    if (!match) return null;
    return { id: match[1], token: match[2], search: parsed.search };
  } catch {
    return null;
  }
}
