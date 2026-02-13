import { fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests that exercise the full worker pipeline (routing → validation
 * → chunking → Discord send) with mocked outbound fetch to avoid hitting
 * real Discord API endpoints.
 */

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
});

function mockDiscordWebhook(opts?: { status?: number; body?: unknown; remaining?: number }) {
  const status = opts?.status ?? 200;
  const body = opts?.body ?? { id: "msg123", type: 0, content: "ok" };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts?.remaining !== undefined) {
    headers["X-RateLimit-Remaining"] = String(opts.remaining);
    headers["X-RateLimit-Reset-After"] = "1.0";
  }

  fetchMock
    .get("https://discord.com")
    .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
    .reply(status, JSON.stringify(body), { headers });
}

describe("Integration", () => {
  it("passes through embeds without chunking", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "A".repeat(3000),
        embeds: [{ title: "test" }],
      }),
    });

    // Should passthrough to Discord (not chunk) — embeds present
    expect(resp.status).toBe(200);
    const body = await resp.json<{ id: string }>();
    expect(body.id).toBe("msg123");
  });

  it("passes through empty content without chunking", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    });

    // Empty content → passthrough → 204 (wait not set)
    expect(resp.status).toBe(204);
  });

  it("passes through null content without chunking", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: null }),
    });

    expect(resp.status).toBe(204);
  });

  it("passes through short content without chunking", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "short message" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json<{ id: string }>();
    expect(body.id).toBe("msg123");
  });

  it("chunks long content and sends multiple requests", async () => {
    // Need to mock multiple Discord responses for multiple chunks
    const discordMock = fetchMock.get("https://discord.com");
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg1", type: 0 }), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "4",
          "X-RateLimit-Reset-After": "1.0",
        },
      });
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg2", type: 0 }), {
        headers: { "Content-Type": "application/json" },
      });

    const longContent = "word ".repeat(500); // ~2500 chars
    const resp = await SELF.fetch(
      "https://example.com/api/webhooks/123/token?max_chars=1500&wait=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: longContent }),
      },
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ id: string }>();
    expect(body.id).toBe("msg1");
  });

  it("preserves username and avatar_url across chunked messages", async () => {
    const discordMock = fetchMock.get("https://discord.com");
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg1", type: 0 }), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "4",
          "X-RateLimit-Reset-After": "1.0",
        },
      });
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg2", type: 0 }), {
        headers: { "Content-Type": "application/json" },
      });

    const longContent = "word ".repeat(500);
    const resp = await SELF.fetch(
      "https://example.com/api/webhooks/123/token?max_chars=1500&wait=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: longContent,
          username: "TestBot",
          avatar_url: "https://example.com/avatar.png",
        }),
      },
    );

    expect(resp.status).toBe(200);
    const body = await resp.json<{ id: string }>();
    expect(body.id).toBe("msg1");
  });

  it("retries after Discord 429 and succeeds", async () => {
    const discordMock = fetchMock.get("https://discord.com");
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(429, JSON.stringify({ message: "rate limited" }), {
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "0.01",
        },
      });
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg1", type: 0 }), {
        headers: { "Content-Type": "application/json" },
      });

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(resp.status).toBe(200);
    const body = await resp.json<{ id: string }>();
    expect(body.id).toBe("msg1");
  });

  it("returns 502 when Discord rejects all retries", async () => {
    const discordMock = fetchMock.get("https://discord.com");
    // First attempt fails
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(500, "Internal Server Error");
    // Retry also fails
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(500, "Internal Server Error");

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello world" }),
    });

    expect(resp.status).toBe(502);
    const body = await resp.json<{ error: string; chunks_sent: number; chunks_total: number }>();
    expect(body.error).toContain("500");
    expect(body.chunks_sent).toBe(0);
    expect(body.chunks_total).toBe(1);
  });

  it("returns 502 with first_message_id on partial chunk failure", async () => {
    const discordMock = fetchMock.get("https://discord.com");
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "msg1", type: 0 }), {
        headers: {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "4",
          "X-RateLimit-Reset-After": "1.0",
        },
      });
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(500, "Internal Server Error");
    discordMock
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(500, "Internal Server Error");

    const longContent = "word ".repeat(500);
    const resp = await SELF.fetch(
      "https://example.com/api/webhooks/123/token?max_chars=1500&wait=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: longContent }),
      },
    );

    expect(resp.status).toBe(502);
    const body = await resp.json<{
      error: string;
      chunks_sent: number;
      chunks_total: number;
      first_message_id?: string;
    }>();
    expect(body.chunks_sent).toBe(1);
    expect(body.chunks_total).toBe(2);
    expect(body.first_message_id).toBe("msg1");
  });

  it("returns 204 when wait is not set", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    // wait is omitted → 204 No Content
    expect(resp.status).toBe(204);
  });

  it("handles explicit wait=false", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });

    expect(resp.status).toBe(204);
  });

  it("returns 204 for passthrough with embeds and no wait", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [{ title: "test" }] }),
    });

    expect(resp.status).toBe(204);
  });

  it("forwards multipart/form-data to Discord as passthrough", async () => {
    fetchMock
      .get("https://discord.com")
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ id: "file1" }), {
        headers: { "Content-Type": "application/json" },
      });

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?wait=true", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=----test" },
      body: '------test\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n{}\r\n------test--',
    });

    expect(resp.status).toBe(200);
  });

  it("preserves thread_id in forwarded requests", async () => {
    mockDiscordWebhook();

    const resp = await SELF.fetch(
      "https://example.com/api/webhooks/123/token?thread_id=999&wait=true",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "threaded message" }),
      },
    );

    expect(resp.status).toBe(200);
  });

  it("returns 422 for unchunkable content", async () => {
    const marker = "`".repeat(99);
    const content = `${marker}\n${"A".repeat(200)}\n${marker}`;

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?max_chars=100", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    expect(resp.status).toBe(422);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("too small");
  });

  it("includes X-Service header in every response", async () => {
    mockDiscordWebhook();
    const pkg = await import("../package.json");
    const expectedHeader = `discord-chunker/${pkg.version}`;

    // 1. Success case
    const resp204 = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(resp204.headers.get("X-Service")).toBe(expectedHeader);

    // 2. Error case (404)
    const resp404 = await SELF.fetch("https://example.com/api/webhooks/invalid/path", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(resp404.headers.get("X-Service")).toBe(expectedHeader);

    // 3. Passthrough case (multipart)
    fetchMock
      .get("https://discord.com")
      .intercept({ path: /^\/api\/webhooks\//, method: "POST" })
      .reply(200, JSON.stringify({ ok: true }), { headers: { "X-Test": "original" } });

    const respMultipart = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=---" },
      body: "-----",
    });
    expect(respMultipart.headers.get("X-Service")).toBe(expectedHeader);
  });
});
