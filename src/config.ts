import type { ChunkerConfig } from "./types";
import { DEFAULT_MAX_CHARS, DEFAULT_MAX_LINES, DISCORD_CHAR_LIMIT } from "./types";

export function parseConfig(params: URLSearchParams): ChunkerConfig {
  const maxCharsRaw = params.get("max_chars");
  const maxLinesRaw = params.get("max_lines");

  const maxChars = parseIntParam(maxCharsRaw, DEFAULT_MAX_CHARS);
  const maxLines = parseIntParam(maxLinesRaw, DEFAULT_MAX_LINES);

  return { maxChars, maxLines };
}

export function validateConfig(config: ChunkerConfig): string | null {
  if (
    !Number.isInteger(config.maxChars) ||
    config.maxChars < 100 ||
    config.maxChars > DISCORD_CHAR_LIMIT
  ) {
    return `max_chars must be an integer between 100 and ${DISCORD_CHAR_LIMIT}`;
  }
  if (!Number.isInteger(config.maxLines) || config.maxLines < 0) {
    return "max_lines must be an integer >= 0 (0 = unlimited)";
  }
  return null;
}

function parseIntParam(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const num = Number(raw);
  if (Number.isNaN(num)) return fallback;
  // Reject non-integers explicitly (e.g. 1999.9)
  if (!Number.isInteger(num)) return num; // Let validateConfig catch it
  return num;
}
