export interface DiscordWebhookPayload {
  content?: string | null;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
  [key: string]: unknown; // Pass through any extra Discord fields
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  [key: string]: unknown;
}

export interface ChunkerConfig {
  maxChars: number;
  maxLines: number;
}

export interface SendResult {
  success: boolean;
  firstMessageObject: Record<string, unknown> | null;
  chunksSent: number;
  chunksTotal: number;
  lastError: string | null; // e.g. "Discord API error: 429 after retry"
}

export interface RateLimitState {
  remaining: number | null;
  resetAfterMs: number | null;
}

// Named constants
export const MAX_INPUT_BYTES = 102_400; // 100KB body size limit
export const DISCORD_CHAR_LIMIT = 2000; // Discord's hard message limit
export const DEFAULT_MAX_CHARS = 1950; // Safe default under Discord limit
export const DEFAULT_MAX_LINES = 17; // Matches OpenClaw default
export const DEFAULT_RETRY_DELAY_MS = 1000;
export const DEFAULT_RATE_LIMIT_DELAY_MS = 2000;
export const USER_AGENT = "discord-chunker/0.1.0";
