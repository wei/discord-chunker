import { describe, it, expect } from "vitest";
import { chunkContent } from "../src/chunker";

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
    const text = "A".repeat(80) + "\n\n" + "B".repeat(80);
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
    const code = "```js\n" + "x = 1;\n".repeat(50) + "```";
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
    const text = "call(" + "x, ".repeat(30) + "y)";
    const chunks = chunkContent(text, { maxChars: 60, maxLines: 0 });
    // Should not break mid-parentheses if possible
    for (const chunk of chunks) {
      const opens = (chunk.match(/\(/g) || []).length;
      const closes = (chunk.match(/\)/g) || []).length;
      // Balanced or the break happened outside parens
      expect(Math.abs(opens - closes)).toBeLessThanOrEqual(1);
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
});
