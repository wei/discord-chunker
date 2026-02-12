// web/url-converter.ts
import { parseWebhookUrl } from "./webhook-pattern";

export function isValidWebhookUrl(url: string): boolean {
  return parseWebhookUrl(url) !== null;
}

export function convertWebhookUrl(url: string, origin?: string): string | null {
  const parsed = parseWebhookUrl(url);
  if (!parsed) return null;

  const base = origin || window.location.origin;
  return `${base}/api/webhooks/${parsed.id}/${parsed.token}${parsed.search}`;
}

export function extractWebhookParts(
  url: string,
): { id: string; token: string; search: string } | null {
  const parsed = parseWebhookUrl(url);
  if (!parsed) return null;

  return { id: parsed.id, token: parsed.token, search: parsed.search };
}
