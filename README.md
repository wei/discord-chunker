![discord-chunker](https://socialify.git.ci/wei/discord-chunker/image?description=1&font=Bitter&language=1&logo=https%3A%2F%2Fcdn.prod.website-files.com%2F6257adef93867e50d84d30e2%2F66e3d80db9971f10a9757c99_Symbol.svg&name=1&owner=1&pattern=Circuit+Board&theme=Auto)

A Discord webhook proxy that intelligently chunks long messages. Drop-in replacement — just swap the URL.

## Usage

Replace your Discord webhook URL:

```diff
- https://discord.com/api/webhooks/123/token
+ https://discord.git.ci/api/webhook/123/token
```

Messages under 1950 characters pass through unchanged. Longer messages are split intelligently:

- Preserves code blocks (``` fences)
- Respects paragraph boundaries
- Avoids breaking inside parentheses
- Handles line count limits

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

## Configuration

| Param | Default | Range | Description |
|-------|---------|-------|-------------|
| `max_chars` | 1950 | 100-2000 | Max characters per chunk |
| `max_lines` | 17 | ≥ 0 (0 = unlimited) | Max lines per chunk |
| `thread_id` | — | — | Forward to thread |
| `wait` | omitted | true/false | Return message object of the first chunk (omitted = Discord default) |

```bash
POST /api/webhook/123/token?max_chars=1500&max_lines=20&thread_id=999
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
