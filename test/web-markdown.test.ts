import { describe, expect, test } from "vitest";

import { renderDiscordMarkdown } from "../web/markdown";

describe("renderDiscordMarkdown", () => {
  test("renders Discord-style headers and lists while keeping inline markdown + code fences", () => {
    const input = [
      "# Title",
      "## Section",
      "### Subsection",
      "-# Supporting heading",
      "",
      "This is **bold** and *italic*.",
      "Second paragraph line.",
      "",
      "- one",
      "- two",
      "- parent",
      "  - child",
      "",
      "1. first",
      "2. second",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n");

    const html = renderDiscordMarkdown(input);

    // Headers: markers are consumed and converted into styled blocks.
    expect(html).toContain('<div class="dc-md-header dc-md-header-1">Title</div>');
    expect(html).toContain('<div class="dc-md-header dc-md-header-2">Section</div>');
    expect(html).toContain('<div class="dc-md-header dc-md-header-3">Subsection</div>');
    expect(html).toContain('<div class="dc-md-header dc-md-header-sub">Supporting heading</div>');
    expect(html).not.toContain("# Title");
    expect(html).not.toContain("## Section");

    // Paragraph + inline emphasis are still handled by discord-markdown.
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain(
      "This is <strong>bold</strong> and <em>italic</em>.<br>Second paragraph line.",
    );

    // Unordered + ordered lists.
    expect(html).toContain('<ul class="dc-md-list dc-md-list-ul">');
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toMatch(
      /<li>parent<ul class="dc-md-list dc-md-list-ul dc-md-list-nested"><li>child<\/li><\/ul><\/li>/,
    );
    expect(html).toContain('<ol class="dc-md-list dc-md-list-ol">');
    expect(html).toContain("<li>first</li>");
    expect(html).toContain("<li>second</li>");

    // Fenced code blocks still use discord-markdown's hljs output.
    expect(html).toMatch(
      /<pre[\s\S]*<code[^>]*class="hljs ts"[^>]*>[\s\S]*const[\s\S]*x[\s\S]*=[\s\S]*1[\s\S]*;[\s\S]*<\/code>[\s\S]*<\/pre>/i,
    );
  });

  test("preserves blank-line spacing (Discord-style) via explicit gap blocks", () => {
    const html = renderDiscordMarkdown(["A", "", "B"].join("\n"));

    // Our renderer should explicitly represent empty lines so spacing matches Discord.
    expect(html).toContain('<div class="dc-md-gap"></div>');
  });

  test("escapes raw HTML by default", () => {
    const html = renderDiscordMarkdown("<script>alert('xss')</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
