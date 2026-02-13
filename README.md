![discord-chunker](https://socialify.git.ci/wei/discord-chunker/image?description=1&font=Bitter&language=1&logo=https%3A%2F%2Fcdn.prod.website-files.com%2F6257adef93867e50d84d30e2%2F66e3d80db9971f10a9757c99_Symbol.svg&name=1&owner=1&pattern=Circuit+Board&theme=Auto)

A Discord webhook proxy that intelligently chunks long messages. Drop-in replacement — just swap the URL.

## Usage

Replace your Discord webhook URL:

```diff
- https://discord.com/api/webhooks/123/token
+ https://discord.git.ci/api/webhook/123/token
```

Messages under 1950 characters pass through unchanged. Longer messages are split intelligently:

- Splits at line boundaries (never mid-line)
- Respects both character and line count limits
- Fence delimiter lines excluded from line count
- Code blocks properly closed/reopened when split across chunks
- Hard-cuts only when a single line exceeds the character limit

Note: when a split occurs inside an active code fence, temporary close/reopen fence wrapper lines may cause a chunk to exceed the configured `max_chars`. This is intentional for fence integrity. The hard Discord limit of 2000 characters is still enforced.

## Health Endpoint

`GET /health` returns a lightweight service status payload that includes both the service identity/version and the incoming request User-Agent.

Example response:

```json
{
  "status": "ok",
  "service": "discord-chunker",
  "version": "0.1.0",
  "service_user_agent": "discord-chunker/0.1.0",
  "request_user_agent": "curl/8.7.1",
  "timestamp": "2026-02-10T04:45:00.000Z"
}
```

The response also includes the `X-Service` header set to the service User-Agent string.

## Logging

All requests emit **exactly one structured JSON log event per service hop** — a "canonical wide event" containing complete operational and business context.

### Log Fields

Each event includes:
- **Request context:** `request_id`, `method`, `path`, `request_user_agent`, `cf_ray`, `cf_colo`, `query_present`
- **Operation:** `route_kind` (health, multipart_passthrough, json_passthrough, chunked, etc.)
- **Business context:** `webhook_id`, `thread_id_present`, `wait`, `has_embeds`, `has_content`, `chunk_count`
- **Telemetry:** `chunks_sent`, `retry_count`, `input_bytes`, `duration_ms`
- **Service metadata:** `service`, `service_version`, `service_user_agent`, `runtime`
- **Outcome:** `status_code`, `outcome` (success/error)

### Example Log

```json
{
  "timestamp": "2026-02-13T10:25:30.000Z",
  "level": "info",
  "service": "discord-chunker",
  "service_version": "0.1.0",
  "service_user_agent": "discord-chunker/0.1.0",
  "runtime": "cloudflare-workers",
  "request_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "method": "POST",
  "path": "/api/webhooks/123/token",
  "request_user_agent": "my-bot/1.0",
  "cf_ray": "8540c123456789",
  "cf_colo": "IAD",
  "query_present": true,
  "webhook_id": "123",
  "route_kind": "chunked",
  "chunk_count": 3,
  "chunks_sent": 3,
  "retry_count": 0,
  "input_bytes": 2500,
  "status_code": 204,
  "duration_ms": 125,
  "outcome": "success"
}
```

**Why one event?** Consolidating all context into a single wide event per request enables powerful debugging and analytics without log spam. Retry telemetry is summarized rather than emitted as separate log lines.

## Configuration

| Param | Default | Range | Description |
|-------|---------|-------|-------------|
| `max_chars` | 1950 | 100-2000 | Max characters per chunk |
| `max_lines` | 20 | ≥ 0 (0 = unlimited) | Max lines per chunk (fence lines excluded) |
| `thread_id` | — | — | Forward to thread |
| `wait` | omitted | true/false | Return message object of the first chunk (omitted = Discord default) |

```bash
POST /api/webhook/123/token?max_chars=1500&max_lines=25&thread_id=999
```

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22

## Deploy

```bash
pnpm install
pnpm wrangler login
pnpm deploy
```

## Development

```bash
pnpm install
pnpm dev        # Local dev server
pnpm test       # Run tests
```

## Design

See [design document](docs/plans/design.md) for full architecture details.
