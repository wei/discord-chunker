import { describe, expect, it } from "vitest";
import { chunkContent, countReadableLines } from "../src/chunker";

describe("chunkContent", () => {
  // --- Passthrough cases ---
  it("returns single chunk for short content", () => {
    const result = chunkContent("hello", { maxChars: 1950, maxLines: 17 });
    expect(result).toEqual(["hello"]);
  });

  it("returns single chunk for empty string", () => {
    expect(chunkContent("", { maxChars: 1950, maxLines: 17 })).toEqual([""]);
  });

  // --- Character splitting ---
  it("splits long plain text at word boundary", () => {
    const words = Array(50).fill("hello").join(" "); // 299 chars
    const chunks = chunkContent(words, { maxChars: 100, maxLines: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("splits at paragraph boundary before word boundary", () => {
    const text = `${"A".repeat(80)}\n\n${"B".repeat(80)}`;
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks[0]).toBe("A".repeat(80));
    expect(chunks[1]).toBe("B".repeat(80));
  });

  it("hard cuts when no break points exist", () => {
    const text = "A".repeat(200);
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(100);
    expect(chunks[1].length).toBe(100);
  });

  // --- Code fence preservation ---
  it("preserves code fences across chunks", () => {
    const code = `\`\`\`js\n${"x = 1;\n".repeat(50)}\`\`\``;
    const chunks = chunkContent(code, { maxChars: 200, maxLines: 0 });
    // First chunk should end with closing fence
    expect(chunks[0]).toMatch(/```$/);
    // Second chunk should start with opening fence
    expect(chunks[1]).toMatch(/^```js\n/);
  });

  it("does not break inside code fence mid-line", () => {
    const text = "before\n\n```\nshort code\n```\n\nafter";
    const chunks = chunkContent(text, { maxChars: 500, maxLines: 0 });
    expect(chunks).toEqual([text]);
  });

  // --- Line limit ---
  it("splits when exceeding max_lines", () => {
    const lines = Array(20).fill("line").join("\n");
    const chunks = chunkContent(lines, { maxChars: 2000, maxLines: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      // Allow some tolerance — re-split is single pass
      const lineCount = chunk.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(10); // generous bound
    }
  });

  it("max_lines=0 means unlimited lines", () => {
    const lines = Array(100).fill("line").join("\n");
    const chunks = chunkContent(lines, { maxChars: 50000, maxLines: 0 });
    expect(chunks).toEqual([lines]);
  });

  // --- Parentheses ---
  it("avoids breaking inside parentheses", () => {
    const text = `call(${"x, ".repeat(30)}y)`;
    const chunks = chunkContent(text, { maxChars: 60, maxLines: 0 });
    // Should not break mid-parentheses if possible
    for (const chunk of chunks) {
      const opens = (chunk.match(/\(/g) || []).length;
      const closes = (chunk.match(/\)/g) || []).length;
      // Balanced or the break happened outside parens
      expect(Math.abs(opens - closes)).toBeLessThanOrEqual(1);
    }
  });

  // --- Line limit + code fence interaction ---
  it("preserves code fences when line-splitting across chunks", () => {
    // Code block with 20 lines of code — will need splitting with max_lines=8
    const code = `\`\`\`typescript\n${Array(20).fill("const x = 1;").join("\n")}\n\`\`\``;
    const chunks = chunkContent(code, { maxChars: 2000, maxLines: 8 });
    expect(chunks.length).toBeGreaterThan(1);

    // Every chunk should have balanced code fences
    for (const chunk of chunks) {
      const fenceMarkers = chunk.match(/^(`{3,}|~{3,})/gm) || [];
      expect(fenceMarkers.length % 2).toBe(0);
    }
  });

  it("preserves fences when line limit splits mid-fence after char split", () => {
    // Simulate the real bug: chunkMarkdownText produces a chunk with a code fence
    // that has more lines than max_lines, then applyLineLimit re-splits it
    const text =
      "# Header\n\n" +
      "```js\n" +
      Array(30).fill("x = 1;").join("\n") +
      "\n```\n\n" +
      "Footer text";
    const chunks = chunkContent(text, { maxChars: 2000, maxLines: 10 });
    expect(chunks.length).toBeGreaterThan(1);

    for (const chunk of chunks) {
      // If chunk contains code content, it must have balanced fences
      if (chunk.includes("x = 1;")) {
        const fenceMarkers = chunk.match(/^(`{3,}|~{3,})/gm) || [];
        expect(fenceMarkers.length % 2).toBe(0);
      }
    }
  });

  // --- Sanity check ---
  it("no chunk exceeds 2000 characters", () => {
    const text = "A".repeat(5000);
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 0 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  // --- Readability-based line counting ---
  it("blank lines do not count toward line limit", () => {
    // 10 content lines separated by blank lines = 10 readable lines, 19 raw lines
    const lines = Array(10).fill("content line").join("\n\n");
    const chunks = chunkContent(lines, { maxChars: 50000, maxLines: 10 });
    expect(chunks).toEqual([lines]); // All fits in one chunk
  });

  it("code fence lines do not count toward line limit", () => {
    // 8 readable lines + 2 fence lines + 2 blank lines = 12 raw lines, 8 readable
    const text = [
      "line 1",
      "line 2",
      "",
      "```js",
      "code 1",
      "code 2",
      "code 3",
      "```",
      "",
      "line 3",
      "line 4",
      "line 5",
    ].join("\n");
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 8 });
    expect(chunks).toEqual([text]); // 8 readable lines fits in maxLines=8
  });

  it("splits when readable line count exceeds limit", () => {
    // 25 readable lines, no blanks, no fences
    const text = Array(25).fill("readable line").join("\n");
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(countReadableLines(chunk)).toBeLessThanOrEqual(10);
    }
  });

  // --- Orphan protection ---
  it("does not leave orphan chunks with 1-2 readable lines", () => {
    // 12 readable lines, maxLines=10 → should NOT split into 10 + 2
    const text = Array(12).fill("content line").join("\n");
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 10 });
    // Should keep as one chunk (12 lines is close enough, orphan protection kicks in)
    expect(chunks).toEqual([text]);
  });

  it("does split when remaining is above orphan threshold", () => {
    // 15 readable lines, maxLines=10 → should split into 10 + 5 (5 > MIN_ORPHAN_LINES)
    const text = Array(15).fill("content line").join("\n");
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 10 });
    expect(chunks.length).toBe(2);
    expect(countReadableLines(chunks[0])).toBe(10);
    expect(countReadableLines(chunks[1])).toBe(5);
  });
});

describe("countReadableLines", () => {
  it("counts only non-blank, non-fence lines", () => {
    expect(countReadableLines("hello\nworld")).toBe(2);
    expect(countReadableLines("hello\n\nworld")).toBe(2);
    expect(countReadableLines("")).toBe(0);
    expect(countReadableLines("```js\ncode\n```")).toBe(1);
    expect(countReadableLines("\n\n\n")).toBe(0);
  });

  it("does not count blank lines inside code fences", () => {
    const text = "```\ncode\n\nmore code\n```";
    expect(countReadableLines(text)).toBe(2); // "code" and "more code"
  });

  it("does not count fence lines even when unclosed", () => {
    const text = "```js\ncode here\nmore code";
    expect(countReadableLines(text)).toBe(2);
  });
});
