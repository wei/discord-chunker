import { describe, expect, it } from "vitest";
import { parseConfig, validateConfig } from "../src/config";

describe("parseConfig", () => {
  it("returns defaults when no params", () => {
    const params = new URLSearchParams();
    const config = parseConfig(params);
    expect(config.maxChars).toBe(1950);
    expect(config.maxLines).toBe(17);
  });

  it("parses max_chars", () => {
    const params = new URLSearchParams("max_chars=1500");
    expect(parseConfig(params).maxChars).toBe(1500);
  });

  it("parses max_lines=0 as unlimited", () => {
    const params = new URLSearchParams("max_lines=0");
    expect(parseConfig(params).maxLines).toBe(0);
  });

  it("ignores non-numeric values and uses defaults", () => {
    const params = new URLSearchParams("max_chars=abc&max_lines=xyz");
    const config = parseConfig(params);
    expect(config.maxChars).toBe(1950);
    expect(config.maxLines).toBe(17);
  });

  it("preserves float values for validation to catch", () => {
    const params = new URLSearchParams("max_chars=1999.9");
    const config = parseConfig(params);
    expect(config.maxChars).toBe(1999.9);
  });
});

describe("validateConfig", () => {
  it("returns null for valid config", () => {
    expect(validateConfig({ maxChars: 1950, maxLines: 17 })).toBeNull();
  });

  it("rejects max_chars below 100", () => {
    expect(validateConfig({ maxChars: 50, maxLines: 17 })).toContain("max_chars");
  });

  it("rejects max_chars above 2000", () => {
    expect(validateConfig({ maxChars: 2001, maxLines: 17 })).toContain("max_chars");
  });

  it("rejects non-integer max_chars", () => {
    expect(validateConfig({ maxChars: 1999.9, maxLines: 17 })).toContain("max_chars");
  });

  it("rejects non-integer max_lines", () => {
    expect(validateConfig({ maxChars: 1950, maxLines: 5.5 })).toContain("max_lines");
  });

  it("rejects negative max_lines", () => {
    expect(validateConfig({ maxChars: 1950, maxLines: -1 })).toContain("max_lines");
  });

  it("allows max_lines=0", () => {
    expect(validateConfig({ maxChars: 1950, maxLines: 0 })).toBeNull();
  });

  it("allows max_chars=2000", () => {
    expect(validateConfig({ maxChars: 2000, maxLines: 0 })).toBeNull();
  });

  it("allows max_chars=100", () => {
    expect(validateConfig({ maxChars: 100, maxLines: 0 })).toBeNull();
  });
});
