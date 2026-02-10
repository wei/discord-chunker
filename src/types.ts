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
}

export interface RateLimitState {
  remaining: number | null;
  resetAfterMs: number | null;
}
