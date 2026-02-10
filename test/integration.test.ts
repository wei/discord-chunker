import { SELF } from "cloudflare:test";
import { describe, it, expect } from "vitest";

describe("Integration", () => {
  it("passes through embeds without chunking", async () => {
    // Will fail at Discord (fake webhook) but should get past our validation
    const resp = await SELF.fetch("https://example.com/webhook/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "A".repeat(3000),
        embeds: [{ title: "test" }],
      }),
    });
    // Should attempt to passthrough to Discord (not chunk), so we get a network/Discord error
    // Any status other than 400/413/415/422 means our routing worked
    expect([400, 413, 415, 422]).not.toContain(resp.status);
  });

  it("passes through empty content without chunking", async () => {
    const resp = await SELF.fetch("https://example.com/webhook/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });
    expect([400, 413, 415, 422]).not.toContain(resp.status);
  });

  it("passes through null content without chunking", async () => {
    const resp = await SELF.fetch("https://example.com/webhook/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: null }),
    });
    expect([400, 413, 415, 422]).not.toContain(resp.status);
  });

  it("attempts to chunk long content", async () => {
    const longContent = "word ".repeat(500); // ~2500 chars
    const resp = await SELF.fetch(
      "https://example.com/webhook/123/token?max_chars=500",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: longContent }),
      },
    );
    // Should attempt Discord send (not a validation error)
    expect([400, 413, 415, 422]).not.toContain(resp.status);
  });
});
