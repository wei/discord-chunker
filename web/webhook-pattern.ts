// Shared webhook URL pattern for HTML input validation and runtime parsing.
// NOTE: The HTML pattern attribute is compiled with the JS `v` flag in modern browsers,
// so `/` must be escaped even inside character classes.
export const WEBHOOK_URL_PATTERN = String.raw`https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/(\d+)\/([^\s\/?#]+)(\?[^\s#]*)?`;

export const WEBHOOK_URL_REGEX = new RegExp(`^${WEBHOOK_URL_PATTERN}$`);

export type WebhookUrlParts = {
  host: string;
  id: string;
  token: string;
  search: string;
};

export function parseWebhookUrl(url: string): WebhookUrlParts | null {
  const match = url.match(WEBHOOK_URL_REGEX);
  if (!match) return null;

  const [, host, id, token, search = ""] = match;
  return { host, id, token, search };
}
