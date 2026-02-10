import type { ChunkerConfig } from "./types";

const DEFAULTS: ChunkerConfig = {
  maxChars: 1950,
  maxLines: 17,
};

export function parseConfig(params: URLSearchParams): ChunkerConfig {
  const maxCharsRaw = params.get("max_chars");
  const maxLinesRaw = params.get("max_lines");

  const maxChars =
    maxCharsRaw !== null && !isNaN(Number(maxCharsRaw))
      ? Math.floor(Number(maxCharsRaw))
      : DEFAULTS.maxChars;

  const maxLines =
    maxLinesRaw !== null && !isNaN(Number(maxLinesRaw))
      ? Math.floor(Number(maxLinesRaw))
      : DEFAULTS.maxLines;

  return { maxChars, maxLines };
}

export function validateConfig(config: ChunkerConfig): string | null {
  if (config.maxChars < 100 || config.maxChars > 2000) {
    return "max_chars must be between 100 and 2000";
  }
  if (config.maxLines < 0) {
    return "max_lines must be >= 0 (0 = unlimited)";
  }
  return null;
}
