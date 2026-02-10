# discord-chunker

A stateless Cloudflare Workers proxy that intelligently chunks long Discord webhook messages. Drop-in replacement — just swap the URL.

## Usage

Replace your Discord webhook URL:

```diff
- https://discord.com/api/webhooks/123/token
+ https://discord-chunker.YOUR-DOMAIN.workers.dev/webhook/123/token
```

Messages under 1950 characters pass through unchanged. Longer messages are split intelligently:

- Preserves code blocks (``` fences)
- Respects paragraph boundaries
- Avoids breaking inside parentheses
- Handles line count limits

## Configuration

| Param | Default | Range | Description |
|-------|---------|-------|-------------|
| `max_chars` | 1950 | 100-2000 | Max characters per chunk |
| `max_lines` | 17 | ≥ 0 (0 = unlimited) | Max lines per chunk |
| `thread_id` | — | — | Forward to thread |
| `wait` | omitted | true/false | Return message object of the first chunk (omitted = Discord default) |

```bash
POST /webhook/123/token?max_chars=1500&max_lines=20&thread_id=999
```

## Deploy

```bash
npm install
npx wrangler login
npx wrangler deploy
```

## Development

```bash
npm install
npm run dev     # Local dev server
npm test        # Run tests
```

## Design

See [design document](docs/plans/2026-02-09-discord-chunker-design.md) for full architecture details.
