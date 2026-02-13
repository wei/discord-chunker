# Wide Event Logging for Discord Chunker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured, canonical wide-event logging so each request emits exactly one context-rich log line with operational and business context.

**Architecture:** Introduce a single logger module that emits JSON events with shared service metadata, then instrument the worker request lifecycle so logging happens in a single `finally` path. Remove scattered retry warnings/errors from chunk send flow and return retry telemetry so the request-level wide event remains complete.

**Tech Stack:** TypeScript, Cloudflare Workers runtime, Vitest (`cloudflare:test`), Biome linting

---

### Task 1: Add test coverage for logger output schema

**Files:**
- Create: `test/logger.test.ts`
- Modify: `test/env.d.ts` (only if type augmentation needed)

**Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi, afterEach } from "vitest";
import { logInfo, logError } from "../src/logger";

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
```

**Step 2: Run test to verify it fails**

Run: `pnpm test test/logger.test.ts`
Expected: FAIL with module-not-found error for `../src/logger`.

**Step 3: Commit test scaffold**

```bash
git add test/logger.test.ts
git commit -m "test(logging): add logger schema tests"
```

---

### Task 2: Implement single structured logger module (info/error)

**Files:**
- Create: `src/logger.ts`
- Modify: `src/types.ts` (if shared logging types are added)

**Step 1: Write minimal implementation**

```ts
import { USER_AGENT } from "./types";

const [service = "unknown", serviceVersion = "unknown"] = USER_AGENT.split("/");

type LogLevel = "info" | "error";

function emit(level: LogLevel, event: Record<string, unknown>): void {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    service,
    service_version: serviceVersion,
    service_user_agent: USER_AGENT,
    runtime: "cloudflare-workers",
    ...event,
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }
  console.info(line);
}

export function logInfo(event: Record<string, unknown>): void {
  emit("info", event);
}

export function logError(event: Record<string, unknown>): void {
  emit("error", event);
}
```

**Step 2: Run logger tests to verify green**

Run: `pnpm test test/logger.test.ts`
Expected: PASS.

**Step 3: Commit logger module**

```bash
git add src/logger.ts src/types.ts
git commit -m "feat(logging): add structured logger module"
```

---

### Task 3: Add failing request-wide logging tests for worker lifecycle

**Files:**
- Modify: `test/index.test.ts`

**Step 1: Write failing tests first**

Add tests that:
1) Assert successful POST emits exactly one `console.info` wide event and no `console.error`.
2) Assert Discord failure path emits one `console.error` wide event with retry metadata.
3) Assert response carries `X-Request-Id` that matches logged `request_id`.

Example test shape:

```ts
const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

// ... issue request via SELF.fetch

expect(infoSpy).toHaveBeenCalledTimes(1);
const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string) as Record<string, unknown>;
expect(parsed.request_id).toBe(resp.headers.get("X-Request-Id"));
expect(parsed.method).toBe("POST");
expect(parsed.path).toBe("/api/webhooks/123/token");
expect(parsed.outcome).toBe("success");
expect(typeof parsed.duration_ms).toBe("number");
```

**Step 2: Run targeted tests to verify RED**

Run: `pnpm test test/index.test.ts`
Expected: FAIL (no wide event logging / missing `X-Request-Id`).

**Step 3: Commit failing tests**

```bash
git add test/index.test.ts
git commit -m "test(worker): assert one wide event log per request"
```

---

### Task 4: Implement request-level wide events and remove scattered retry logs

**Files:**
- Modify: `src/index.ts`
- Modify: `src/discord.ts`
- Modify: `src/types.ts`

**Step 1: Add request-wide event lifecycle in `src/index.ts`**

Implementation requirements:
- Build request ID (`X-Request-Id` header, fallback `CF-Ray`, fallback `crypto.randomUUID()`).
- Initialize wide event object with:
  - `request_id`, `method`, `path`, `request_user_agent`, `timestamp` (from logger),
  - `cf_ray`, `cf_colo` (if available),
  - `query_present`.
- Enrich event through request flow with business context:
  - `route_kind` (`health`, `redirect`, `multipart_passthrough`, `json_passthrough`, `chunked`),
  - `webhook_id`, `thread_id_present`, `wait`, `input_bytes`, `has_embeds`, `has_content`,
  - `chunk_count`, `chunks_sent`, `retry_count` (from send result).
- Emit exactly one log in `finally`:
  - `status_code`, `outcome` (`success` / `error`), `duration_ms`.
  - `logInfo` for non-5xx; `logError` for 5xx/exception paths.
- Attach `X-Request-Id` to outgoing response headers in `fetch` wrapper.

**Step 2: Replace scattered retry logs in `src/discord.ts` with telemetry**

- Remove unstructured `console.warn` / `console.error` calls.
- Track retry count numerically during send loop.
- Return retry metadata in `SendResult` (`retryCount`, optional `lastStatus`).

**Step 3: Run targeted tests**

Run: `pnpm test test/index.test.ts test/discord.test.ts test/integration.test.ts`
Expected: PASS with no retry warning/error text logs.

**Step 4: Commit implementation**

```bash
git add src/index.ts src/discord.ts src/types.ts
git commit -m "feat(worker): emit canonical request-wide structured logs"
```

---

### Task 5: Document the logging contract and verify full project

**Files:**
- Modify: `README.md`

**Step 1: Add logging section**

Document:
- Canonical “one log event per request” behavior.
- Key fields (`request_id`, `route_kind`, `status_code`, `duration_ms`, `chunk_count`, `retry_count`).
- Why retries are summarized in wide events rather than emitted as separate logs.

**Step 2: Run full verification**

Run:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

Expected: all pass.

**Step 3: Commit docs + verification-aligned changes**

```bash
git add README.md
git commit -m "docs(logging): describe canonical request-wide events"
```

---

### Task 6: Open PR with implementation summary and verification evidence

**Files:**
- N/A (GitHub metadata)

**Step 1: Push feature branch**

Run: `git push -u origin feat/wide-event-logging`

**Step 2: Create PR**

Use title/body:
- Title: `feat: add canonical wide-event logging for worker requests`
- Body includes:
  - Summary of logger architecture,
  - List of fields added,
  - Note about removing scattered retry logs,
  - Verification command output summary.

**Step 3: Commit status check**

Run: `git status --short --branch`
Expected: clean working tree.
