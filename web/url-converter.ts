// web/url-converter.ts
import { WEBHOOK_URL_REGEX } from "./webhook-pattern";

const WEBHOOK_REGEX = WEBHOOK_URL_REGEX;

export function isValidWebhookUrl(url: string): boolean {
  return WEBHOOK_REGEX.test(url);
}

export function convertWebhookUrl(url: string, origin?: string): string | null {
  const match = url.match(WEBHOOK_REGEX);
  if (!match) return null;
  const [, , id, token, query] = match;
  const base = origin || window.location.origin;
  return `${base}/api/webhooks/${id}/${token}${query || ""}`;
}

const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com"]);

export function extractWebhookParts(
  url: string,
): { id: string; token: string; search: string } | null {
  try {
    const parsed = new URL(url);
    if (!DISCORD_HOSTS.has(parsed.hostname)) return null;
    const match = parsed.pathname.match(/\/api\/webhooks\/(\d+)\/([^/]+)$/);
    if (!match) return null;
    return { id: match[1], token: match[2], search: parsed.search };
  } catch {
    return null;
  }
}
