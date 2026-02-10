import { describe, expect, test } from "vitest";

import { renderDiscordMarkdown } from "../web/markdown";

describe("renderDiscordMarkdown", () => {
  test("renders Discord-style markdown (bold, italic, code blocks) and preserves line breaks", () => {
    const input = [
      "# Title",
      "",
      "This is **bold** and *italic*.",
      "",
      "- one",
      "- two",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");

    const html = renderDiscordMarkdown(input);

    // Discord's chat markdown does not treat # / - as semantic headings/lists.
    // They should remain as plain text, but with <br> inserted.
    expect(html).toContain("# Title");
    expect(html).toMatch(/- one<br>\s*- two/);

    // Emphasis
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toMatch(/<em>italic<\/em>/);

    // Code blocks
    expect(html).toMatch(
      /<pre[\s\S]*<code[^>]*>[\s\S]*const[\s\S]*x[\s\S]*=[\s\S]*1[\s\S]*;[\s\S]*<\/code>[\s\S]*<\/pre>/i,
    );
  });

  test("escapes raw HTML by default", () => {
    const html = renderDiscordMarkdown("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
