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
