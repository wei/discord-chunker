import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "../src/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("emits structured info logs with service metadata", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo({ request_id: "req-1", path: "/health", status_code: 200 });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [line] = infoSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.level).toBe("info");
    expect(parsed.service).toBe("discord-chunker");
    expect(parsed.service_version).toMatch(/\d+\.\d+\.\d+/);
    expect(parsed.request_id).toBe("req-1");
    expect(parsed.path).toBe("/health");
    expect(parsed.status_code).toBe(200);
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("emits structured error logs", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logError({ request_id: "req-err", outcome: "error", status_code: 502 });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [line] = errorSpy.mock.calls[0] as [string];
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed.level).toBe("error");
    expect(parsed.request_id).toBe("req-err");
    expect(parsed.outcome).toBe("error");
    expect(parsed.status_code).toBe(502);
  });
});
