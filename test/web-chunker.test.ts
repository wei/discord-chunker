import { describe, expect, it } from "vitest";
import { chunkContent } from "../src/chunker";
import { parseConfig } from "../src/config";

describe("Shared chunker (web compatibility)", () => {
  it("chunks long content with default config", () => {
    const config = parseConfig(new URLSearchParams());
    const longContent = "A".repeat(2500);
    const chunks = chunkContent(longContent, config);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("preserves code fences across chunks", () => {
    const config = parseConfig(new URLSearchParams());
    const content = `Hello\n\n${"```"}js\n${"x\n".repeat(200)}${"```"}\n\nEnd`;
    const chunks = chunkContent(content, config);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const opens = (chunk.match(/```/g) || []).length;
      expect(opens % 2).toBe(0);
    }
  });
});
