import { describe, expect, it } from "vitest";
import { chunkContent, countLines } from "../src/chunker";

describe("countLines", () => {
  it("returns 0 for empty string", () => {
    expect(countLines("")).toBe(0);
  });

  it("counts non-fence lines", () => {
    expect(countLines("hello")).toBe(1);
    expect(countLines("a\nb\nc")).toBe(3);
  });

  it("excludes fence delimiter lines", () => {
    expect(countLines("```js\ncode\n```")).toBe(1);
    expect(countLines("~~~\ncode\n~~~")).toBe(1);
  });

  it("counts blank lines", () => {
    expect(countLines("a\n\nb")).toBe(3);
  });

  it("handles nested/multiple fence blocks", () => {
    expect(countLines("before\n```\ncode\n```\nafter")).toBe(3);
  });

  it("excludes indented fence lines", () => {
    expect(countLines("   ```\ncode\n   ```")).toBe(1);
  });

  it("returns 0 for fence-only content", () => {
    expect(countLines("```\n```")).toBe(0);
  });

  it("handles single line", () => {
    expect(countLines("hello world")).toBe(1);
  });
});

describe("chunkContent", () => {
  // --- Passthrough ---
  it("returns single chunk for short content", () => {
    expect(chunkContent("hello", { maxChars: 1950, maxLines: 20 })).toEqual(["hello"]);
  });

  it("returns single chunk for empty string", () => {
    expect(chunkContent("", { maxChars: 1950, maxLines: 20 })).toEqual([""]);
  });

  // --- Character splitting ---
  it("splits when adding a line would exceed maxChars", () => {
    const text = `${"A".repeat(80)}\n${"B".repeat(80)}`;
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks).toEqual(["A".repeat(80), "B".repeat(80)]);
  });

  it("preserves leading indentation when flushing", () => {
    const text = `hello\n    two\nend`;
    const chunks = chunkContent(text, { maxChars: 10, maxLines: 0 });
    expect(chunks).toEqual(["hello", "    two", "end"]);
  });

  it("does not prematurely flush when current line closes active fence", () => {
    const text = `\`\`\`js\n${"A".repeat(90)}\n\`\`\``;
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks).toEqual([text]);
  });

  it("hard-cuts a single line exceeding maxChars", () => {
    const text = "A".repeat(200);
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks).toEqual(["A".repeat(100), "A".repeat(100)]);
  });

  it("preserves reopened fence when hard-cut happens inside an active code block", () => {
    const text = `\`\`\`js\nshort\n${"A".repeat(220)}\nend\n\`\`\``;
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[1]).toMatch(/^```js\n/);
    for (const chunk of chunks) {
      const fenceCount = (chunk.match(/```/g) || []).length;
      expect(fenceCount % 2).toBe(0);
    }
  });

  it("never splits mid-line when line fits individually", () => {
    const text = `${"A".repeat(40)}\n${"B".repeat(40)}\n${"C".repeat(40)}`;
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks).toEqual([`${"A".repeat(40)}\n${"B".repeat(40)}`, "C".repeat(40)]);
  });

  it("no chunk exceeds maxChars", () => {
    const text = Array(50).fill("hello world").join("\n");
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  // --- Line splitting ---
  it("splits when line count exceeds maxLines", () => {
    const text = Array(10).fill("line").join("\n");
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 5 });
    expect(chunks).toEqual([Array(5).fill("line").join("\n"), Array(5).fill("line").join("\n")]);
  });

  it("max_lines=0 means unlimited", () => {
    const text = Array(100).fill("line").join("\n");
    expect(chunkContent(text, { maxChars: 50000, maxLines: 0 })).toEqual([text]);
  });

  it("splits by whichever limit is hit first", () => {
    const text = "a\nb\nc\nd\ne";
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 3 });
    expect(chunks).toEqual(["a\nb\nc", "d\ne"]);
  });

  // --- Fence lines excluded from line count ---
  it("fence delimiters do not count toward maxLines", () => {
    // 2 fence lines + 3 content lines = 5 raw lines, 3 content lines
    const text = "```js\na\nb\nc\n```";
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 3 });
    expect(chunks).toEqual([text]); // fits: only 3 content lines
  });

  it("splits when content lines inside fence exceed maxLines", () => {
    const code = `\`\`\`\n${Array(10).fill("x").join("\n")}\n\`\`\``;
    const chunks = chunkContent(code, { maxChars: 50000, maxLines: 5 });
    expect(chunks.length).toBeGreaterThan(1);
  });

  // --- Tilde fences ---
  it("handles tilde fence blocks", () => {
    const text = "~~~\ncode\n~~~";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("closes and reopens tilde fence when split across chunks", () => {
    const code = `~~~\n${Array(10).fill("code").join("\n")}\n~~~`;
    const chunks = chunkContent(code, { maxChars: 50000, maxLines: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toMatch(/~~~$/);
    expect(chunks[1]).toMatch(/^~~~/);
  });

  it("does not close backtick fence with tilde markers", () => {
    const text = "```js\ncode\n~~~\nmore\n```";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("does not close tilde fence with backtick markers", () => {
    const text = "~~~\ncode\n```\nmore\n~~~";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("requires matching or longer marker length to close fence", () => {
    const text = "````\ncode\n```\nstill code\n````";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("handles indented fence opening (up to 3 spaces)", () => {
    const text = "   ```js\ncode\n   ```";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("fence delimiters with tilde markers excluded from line count", () => {
    const text = "~~~\na\nb\nc\n~~~";
    const chunks = chunkContent(text, { maxChars: 50000, maxLines: 3 });
    expect(chunks).toEqual([text]);
  });

  // --- Fence close/reopen across chunks ---
  it("closes and reopens fence when split lands inside code block", () => {
    const code = `\`\`\`js\n${Array(10).fill("code").join("\n")}\n\`\`\``;
    const chunks = chunkContent(code, { maxChars: 50000, maxLines: 5 });
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk should end with closing fence
    expect(chunks[0]).toMatch(/```$/);
    // Second chunk should start with reopened fence
    expect(chunks[1]).toMatch(/^```js/);
    // Last chunk should end with the original closing fence
    expect(chunks[chunks.length - 1]).toMatch(/```$/);
  });

  // --- Both limits ---
  it("respects both maxChars and maxLines together", () => {
    const text = Array(25).fill("X".repeat(50)).join("\n");
    const chunks = chunkContent(text, { maxChars: 200, maxLines: 10 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(200);
      expect(countLines(chunk)).toBeLessThanOrEqual(10);
    }
  });

  // --- Sanity ---
  it("preserves info string if opening fence fits within maxChars", () => {
    const info = "typescript";
    const text = `\`\`\`${info}\ncode\n\`\`\``;
    // maxChars=50 is enough for ```typescript (13 chars)
    const chunks = chunkContent(text, { maxChars: 50, maxLines: 0 });

    expect(chunks).toEqual([text]);
  });

  it("truncates oversized opening fence to just markers and drops info string", () => {
    // Info string makes the line ~153 chars long
    const longInfo = "A".repeat(150);
    const text = `\`\`\`${longInfo}\ncode\n\`\`\``;

    // maxChars=100. The opening line > 100.
    // Expectation: The first chunk should be just "```" (plus newline/code if it fits, or just the fence line)
    // In this implementation, since we replace the line with "```", it becomes short enough to be added to 'current'.
    // Then "code" and "```" are added.
    // So if "```\ncode\n```" fits in 100 chars (it does), it should all be one chunk,
    // BUT the opening line must be reduced to just "```".

    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });

    // Verify valid chunks (sanity check)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }

    // The result should look like:
    // ```
    // code
    // ```
    // NOT containing the long AAAAA... string.
    const expectedContent = "```\ncode\n```";
    expect(chunks[0]).toBe(expectedContent);
    expect(chunks[0]).not.toContain("AAAA");
  });

  it("no chunk exceeds 2000 characters", () => {
    const text = "A".repeat(5000);
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 0 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("throws when maxChars too small for fence wrapper overhead", () => {
    const text = `\`\`\`js\n${"A".repeat(200)}\n\`\`\``;
    expect(() => chunkContent(text, { maxChars: 10, maxLines: 0 })).toThrow(
      "too small to preserve active code fence wrappers",
    );
  });

  it("handles content that is only newlines", () => {
    const text = "\n\n\n";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("handles single fence line without closing", () => {
    const text = "```js\ncode without close";
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 20 });
    expect(chunks).toEqual([text]);
  });

  it("preserves content integrity across all chunks", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`);
    const text = lines.join("\n");
    const chunks = chunkContent(text, { maxChars: 200, maxLines: 5 });
    const reassembled = chunks.join("\n");
    const reassembledLines = reassembled.split("\n");
    for (const line of lines) {
      expect(reassembledLines).toContain(line);
    }
  });
});
