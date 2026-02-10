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

  it("hard-cuts a single line exceeding maxChars", () => {
    const text = "A".repeat(200);
    const chunks = chunkContent(text, { maxChars: 100, maxLines: 0 });
    expect(chunks).toEqual(["A".repeat(100), "A".repeat(100)]);
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
  it("no chunk exceeds 2000 characters", () => {
    const text = "A".repeat(5000);
    const chunks = chunkContent(text, { maxChars: 1950, maxLines: 0 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });
});
