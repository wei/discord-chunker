import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDiscordUrl,
  sendChunks,
  updateRateLimitState,
  validateContentType,
} from "../src/discord";

describe("buildDiscordUrl", () => {
  it("builds basic URL without params", () => {
    const url = buildDiscordUrl("123", "token");
    expect(url).toBe("https://discord.com/api/webhooks/123/token");
  });

  it("adds wait=true", () => {
    const url = buildDiscordUrl("123", "token", undefined, true);
    expect(url).toContain("wait=true");
  });

  it("adds thread_id", () => {
    const url = buildDiscordUrl("123", "token", "999");
    expect(url).toContain("thread_id=999");
  });

  it("adds both wait and thread_id", () => {
    const url = buildDiscordUrl("123", "token", "999", true);
    expect(url).toContain("wait=true");
    expect(url).toContain("thread_id=999");
  });

  it("omits wait when undefined", () => {
    const url = buildDiscordUrl("123", "token");
    expect(url).not.toContain("wait");
  });

  it("adds wait=false when explicitly false", () => {
    const url = buildDiscordUrl("123", "token", undefined, false);
    expect(url).toContain("wait=false");
  });
});

describe("validateContentType", () => {
  it("returns json for application/json", () => {
    expect(validateContentType("application/json")).toBe("json");
  });

  it("returns json for application/json with charset", () => {
    expect(validateContentType("application/json; charset=utf-8")).toBe("json");
  });

  it("returns multipart for multipart/form-data", () => {
    expect(validateContentType("multipart/form-data; boundary=---")).toBe("multipart");
  });

  it("returns null for unsupported type", () => {
    expect(validateContentType("application/x-www-form-urlencoded")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(validateContentType("")).toBeNull();
  });
});

describe("updateRateLimitState", () => {
  it("parses rate limit headers", () => {
    const response = new Response("ok", {
      headers: {
        "X-RateLimit-Remaining": "3",
        "X-RateLimit-Reset-After": "1.5",
      },
    });
    const state = updateRateLimitState(response);
    expect(state.remaining).toBe(3);
    expect(state.resetAfterMs).toBe(1500);
  });

  it("returns null when headers missing", () => {
    const response = new Response("ok");
    const state = updateRateLimitState(response);
    expect(state.remaining).toBeNull();
    expect(state.resetAfterMs).toBeNull();
  });
});

describe("sendChunks", () => {
  let originalFetch: typeof globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockDiscordResponse(
    id: string,
    opts?: {
      status?: number;
      remaining?: number;
      resetAfter?: string;
      body?: unknown;
    },
  ) {
    const status = opts?.status ?? 200;
    const body = opts?.body ?? { id, type: 0, content: "test" };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (opts?.remaining !== undefined) {
      headers["X-RateLimit-Remaining"] = String(opts.remaining);
    }
    if (opts?.resetAfter !== undefined) {
      headers["X-RateLimit-Reset-After"] = opts.resetAfter;
    }
    return new Response(JSON.stringify(body), { status, headers });
  }

  it("sends single chunk successfully with wait=true", async () => {
    fetchMock.mockResolvedValueOnce(mockDiscordResponse("msg1"));

    const result = await sendChunks([{ content: "hello" }], "123", "token", undefined, true);

    expect(result.success).toBe(true);
    expect(result.chunksSent).toBe(1);
    expect(result.chunksTotal).toBe(1);
    expect(result.firstMessageObject).toEqual({
      id: "msg1",
      type: 0,
      content: "test",
    });
    expect(result.lastError).toBeNull();

    // Verify wait=true was in the URL
    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).toContain("wait=true");
  });

  it("sends single chunk without wait when wait=undefined", async () => {
    fetchMock.mockResolvedValueOnce(mockDiscordResponse("msg1"));

    const result = await sendChunks([{ content: "hello" }], "123", "token");

    expect(result.success).toBe(true);
    expect(result.firstMessageObject).toBeNull();

    const calledUrl = fetchMock.mock.calls[0][0];
    expect(calledUrl).not.toContain("wait");
  });

  it("sends multiple chunks with wait only on first", async () => {
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 4 }))
      .mockResolvedValueOnce(mockDiscordResponse("msg2", { remaining: 3 }))
      .mockResolvedValueOnce(mockDiscordResponse("msg3", { remaining: 2 }));

    const result = await sendChunks(
      [{ content: "chunk1" }, { content: "chunk2" }, { content: "chunk3" }],
      "123",
      "token",
      undefined,
      true,
    );

    expect(result.success).toBe(true);
    expect(result.chunksSent).toBe(3);
    expect(result.firstMessageObject?.id).toBe("msg1");

    // First call has wait=true, rest don't
    expect(fetchMock.mock.calls[0][0]).toContain("wait=true");
    expect(fetchMock.mock.calls[1][0]).not.toContain("wait");
    expect(fetchMock.mock.calls[2][0]).not.toContain("wait");
  });

  it("forwards thread_id on all chunks", async () => {
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1"))
      .mockResolvedValueOnce(mockDiscordResponse("msg2"));

    await sendChunks([{ content: "chunk1" }, { content: "chunk2" }], "123", "token", "thread999");

    expect(fetchMock.mock.calls[0][0]).toContain("thread_id=thread999");
    expect(fetchMock.mock.calls[1][0]).toContain("thread_id=thread999");
  });

  it("retries on 429 with Retry-After header", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "rate limited" }), {
          status: 429,
          headers: { "Retry-After": "0.01" },
        }),
      )
      .mockResolvedValueOnce(mockDiscordResponse("msg1"));

    const result = await sendChunks([{ content: "hello" }], "123", "token", undefined, true);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 500 with default delay", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }))
      .mockResolvedValueOnce(mockDiscordResponse("msg1"));

    const result = await sendChunks([{ content: "hello" }], "123", "token", undefined, true);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns partial failure when retry also fails", async () => {
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 4 }))
      .mockResolvedValueOnce(new Response("error", { status: 500 }))
      .mockResolvedValueOnce(new Response("error again", { status: 500 }));

    const result = await sendChunks(
      [{ content: "chunk1" }, { content: "chunk2" }],
      "123",
      "token",
      undefined,
      true,
    );

    expect(result.success).toBe(false);
    expect(result.chunksSent).toBe(1);
    expect(result.chunksTotal).toBe(2);
    expect(result.lastError).toContain("500");
    expect(result.lastError).toContain("after retry");
  });

  it("preemptively delays when remaining === 1 and more chunks", async () => {
    // When remaining === 1 and there are more chunks, sendChunks should
    // still complete successfully (the delay happens internally via sleep)
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 1, resetAfter: "0.001" }))
      .mockResolvedValueOnce(mockDiscordResponse("msg2", { remaining: 4 }));

    const result = await sendChunks([{ content: "chunk1" }, { content: "chunk2" }], "123", "token");

    expect(result.success).toBe(true);
    expect(result.chunksSent).toBe(2);
    // Both chunks were sent
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses default delay when remaining === 1 but resetAfterMs is null", async () => {
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 1 }))
      .mockResolvedValueOnce(mockDiscordResponse("msg2", { remaining: 4 }));

    const result = await sendChunks([{ content: "chunk1" }, { content: "chunk2" }], "123", "token");

    expect(result.success).toBe(true);
    expect(result.chunksSent).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends correct User-Agent header", async () => {
    fetchMock.mockResolvedValueOnce(mockDiscordResponse("msg1"));

    await sendChunks([{ content: "hello" }], "123", "token");

    const calledInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^discord-chunker\//);
  });

  it("sends correct Content-Type header", async () => {
    fetchMock.mockResolvedValueOnce(mockDiscordResponse("msg1"));

    await sendChunks([{ content: "hello" }], "123", "token");

    const calledInit = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("does NOT preemptively delay when remaining > 1", async () => {
    fetchMock
      .mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 3 }))
      .mockResolvedValueOnce(mockDiscordResponse("msg2", { remaining: 2 }));

    const result = await sendChunks([{ content: "chunk1" }, { content: "chunk2" }], "123", "token");

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT delay when remaining === 1 on last chunk", async () => {
    fetchMock.mockResolvedValueOnce(mockDiscordResponse("msg1", { remaining: 1, resetAfter: "2" }));

    const start = Date.now();
    const result = await sendChunks([{ content: "only chunk" }], "123", "token");
    const elapsed = Date.now() - start;

    expect(result.success).toBe(true);
    // Should NOT delay 2 seconds — last chunk
    expect(elapsed).toBeLessThan(500);
  });

  it("handles non-JSON Discord response gracefully", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Bad Gateway</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await sendChunks([{ content: "hello" }], "123", "token", undefined, true);

    expect(result.success).toBe(true);
    // firstMessageObject should be null (parse failed gracefully)
    expect(result.firstMessageObject).toBeNull();
  });
});
