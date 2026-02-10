// web/markdown.ts
// Converts Discord-flavored markdown into HTML suitable for preview rendering.
//
// We use `discord-markdown` because it matches Discord's markdown rules much more
// closely than generic Markdown parsers.

import { toHTML } from "discord-markdown";

export function renderDiscordMarkdown(input: string): string {
  return toHTML(input, {
    // Prevent arbitrary HTML injection in the preview.
    escapeHTML: true,
  });
}
