import { describe, expect, test } from "vitest";

import { CHUNKER_HTML } from "../src/html";

describe("CHUNKER_HTML script embedding", () => {
  test("contains exactly one real closing script tag", () => {
    const scriptOpen = CHUNKER_HTML.indexOf("<script>");
    expect(scriptOpen).toBeGreaterThanOrEqual(0);

    const firstClose = CHUNKER_HTML.toLowerCase().indexOf("</script>", scriptOpen);
    expect(firstClose).toBeGreaterThan(scriptOpen);

    const secondClose = CHUNKER_HTML.toLowerCase().indexOf("</script>", firstClose + 1);
    expect(secondClose).toBe(-1);
  });

  test("uses Plus Jakarta Sans primary font and requested mono stack", () => {
    expect(CHUNKER_HTML).toContain('"Plus Jakarta Sans"');
    expect(CHUNKER_HTML).toMatch(
      /--font-code:\s*"Consolas",\s*Menlo,\s*Monaco,\s*ui-monospace,\s*monospace;/,
    );
  });

  test("dry run triggers smooth scrolling to chunk preview", () => {
    expect(CHUNKER_HTML).toContain('getElementById("chunk-results")');
    expect(CHUNKER_HTML).toContain('scrollIntoView({behavior:"smooth",block:"start"})');
  });
});
