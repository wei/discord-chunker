import { fetchMock, SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.deactivate();
  vi.restoreAllMocks();
});

describe("Worker", () => {
  it("returns health status with service and user agent details", async () => {
    const resp = await SELF.fetch("https://example.com/health", {
      method: "GET",
      headers: { "User-Agent": "Vitest-UA/1.0" },
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("application/json");

    const body = await resp.json<{
      status: string;
      service: string;
      service_user_agent: string;
      request_user_agent: string;
    }>();

    expect(body.status).toBe("ok");
    expect(body.service).toBe("discord-chunker");
    expect(body.service_user_agent).toMatch(/^discord-chunker\/\d+\.\d+\.\d+$/);
    expect(body.request_user_agent).toBe("Vitest-UA/1.0");
    expect(resp.headers.get("X-Service")).toBe(body.service_user_agent);
  });

  it("rejects non-POST requests", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "GET",
    });
    expect(resp.status).toBe(405);
  });

  it("passes through multipart/form-data to Discord", async () => {
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

  it("returns 405 for non-POST non-GET methods", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(resp.status).toBe(405);
  });

  it("returns 405 for DELETE method", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "DELETE",
    });
    expect(resp.status).toBe(405);
  });

  it("rejects invalid path", async () => {
    const resp = await SELF.fetch("https://example.com/invalid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(resp.status).toBe(404);
  });

  it("rejects unsupported Content-Type", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "content=hello",
    });
    expect(resp.status).toBe(415);
  });

  it("rejects payload over 100KB", async () => {
    const bigContent = JSON.stringify({ content: "A".repeat(110000) });
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bigContent,
    });
    expect(resp.status).toBe(413);
  });

  it("rejects invalid config", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token?max_chars=50", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("max_chars");
  });

  it("rejects invalid JSON body", async () => {
    const resp = await SELF.fetch("https://example.com/api/webhooks/123/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{{",
    });
    expect(resp.status).toBe(400);
    const body = await resp.json<{ error: string }>();
    expect(body.error).toContain("Invalid JSON");
  });
});

describe("Logging", () => {
  it("emits exactly one structured info log for successful health check", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resp = await SELF.fetch("https://example.com/health");
    expect(resp.status).toBe(200);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();

    const [line] = infoSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.request_id).toBe(resp.headers.get("X-Request-Id"));
    expect(parsed.method).toBe("GET");
    expect(parsed.path).toBe("/health");
    expect(parsed.outcome).toBe("success");
    expect(parsed.route_kind).toBe("health");
    expect(typeof parsed.duration_ms).toBe("number");
  });

  it("emits structured error log for 4xx/5xx requests", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resp = await SELF.fetch("https://example.com/invalid-path", { method: "POST" });
    expect(resp.status).toBe(404);

    expect(infoSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const [line] = errorSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.request_id).toBe(resp.headers.get("X-Request-Id"));
    expect(parsed.method).toBe("POST");
    expect(parsed.path).toBe("/invalid-path");
    expect(parsed.outcome).toBe("error");
    expect(parsed.status_code).toBe(404);
  });

  it("redacts webhook token from logged path and tags method_not_allowed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resp = await SELF.fetch("https://example.com/api/webhooks/123/super-secret-token", {
      method: "PUT",
    });

    expect(resp.status).toBe(405);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    const parsed = JSON.parse(errorSpy.mock.calls[0][0] as string) as Record<string, unknown>;
    expect(parsed.route_kind).toBe("method_not_allowed");
    expect(parsed.path).toBe("/api/webhooks/:id/:token");
    expect(String(parsed.path)).not.toContain("super-secret-token");
  });
});
