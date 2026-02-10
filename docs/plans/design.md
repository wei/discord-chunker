# Discord Chunker Proxy - Design Document

**Date:** 2026-02-09  
**Status:** Design Complete, Ready for Implementation

## Overview

A stateless Cloudflare Workers proxy that intercepts Discord webhook requests and intelligently chunks long messages before forwarding to Discord. Uses OpenClaw's proven chunking logic to preserve code blocks, respect markdown structure, and avoid breaking mid-sentence.

## Problem Statement

Discord webhooks have a 2000-character limit per message. Applications sending long content must either:
1. Manually chunk messages client-side (tedious, error-prone)
2. Let Discord truncate (loses information)
3. Use existing webhook proxies (only handle rate limits, not chunking)

**This proxy solves the chunking problem as a reusable service independent of OpenClaw.**

## Architecture

### High-Level Flow

```
[Your App] → POST /api/webhook/{id}/{token}?wait=true&max_chars=1950
    ↓
[CF Worker]
  - Detect Content-Type (JSON vs multipart)
  - If multipart → passthrough to Discord unchanged
  - Validate JSON request
  - Parse config from query params
  - Check if needs chunking (no embeds, content-only)
  - Chunk content using OpenClaw's algorithm
  - Send chunks sequentially to Discord (with ?wait=true)
  - Track X-RateLimit-Remaining; preemptively delay when near limit
  - Handle 429 rate limits with single retry
    ↓
[Discord API] ← Multiple sequential POSTs (if chunked)
```

### Project Structure

```
discord-chunker/
├── src/
│   ├── index.ts           # Main worker entry
│   ├── chunker.ts         # Smart chunking logic (from OpenClaw)
│   ├── discord.ts         # Discord API calls, rate limit tracking & retry
│   ├── config.ts          # Config parsing & validation
│   └── types.ts           # TypeScript types
├── wrangler.toml          # CF Workers config
├── package.json
└── tsconfig.json
```

## Configuration

### Default Config (Snake Case for Query Strings)

```typescript
{
  max_chars: 1950,       // Safe under Discord's 2000 limit
  max_lines: 17          // Matches OpenClaw default (0 = unlimited)
}
```

### Query Parameter Overrides

```bash
# Use defaults
POST /api/webhook/123/token

# Custom limits
POST /api/webhook/123/token?max_chars=1500&max_lines=20

# Unlimited lines
POST /api/webhook/123/token?max_lines=0

# With thread_id (forwarded to Discord)
POST /api/webhook/123/token?thread_id=987654321
```

### Validation Rules

- `max_chars`: 100-2000 (inclusive)
- `max_lines`: ≥ 0 (0 = unlimited)
- Invalid values return 400 with clear error message

## Chunking Logic

### Decision Tree

```
If (Content-Type is multipart/form-data):
  → Passthrough entire request to Discord (file uploads)

If (has embeds):
  → Passthrough to Discord (no chunking)

If (content is empty, null, or missing):
  → Passthrough to Discord (nothing to chunk)

Else if (content > max_chars OR content lines > max_lines):
  → Chunk content field using OpenClaw algorithm

Else:
  → Passthrough (fits in one message)
```

### Examples

```json
// Case 1: Pure text, long → CHUNK IT
{"content": "3000 chars..."}
→ Splits into 2 messages

// Case 2: Multipart request (file upload) → PASSTHROUGH
POST with Content-Type: multipart/form-data
→ Forward as-is to Discord

// Case 3: Has embed → PASSTHROUGH
{"content": "3000 chars", "embeds": [{"title": "Hi"}]}
→ Send as-is (user responsibility)

// Case 4: Short text only → PASSTHROUGH
{"content": "50 chars"}
→ Send as-is (1 message)

// Case 5: Empty/null content → PASSTHROUGH
{"content": null} or {"content": ""} or {}
→ Send as-is
```

### OpenClaw-Compatible Smart Chunking

**Reference:** [OpenClaw's chunking implementation](https://github.com/openclaw/openclaw/blob/main/src/auto-reply/chunk.ts)

The chunking algorithm implements OpenClaw's proven logic:

1. **Parse code fences upfront** - Detect ` ```...``` ` and `~~~...~~~` blocks
2. **Split on paragraphs first** - Respects `\n\n` boundaries outside fences
3. **Avoid breaking inside parentheses** - Tracks `()` depth for function calls
4. **Priority order for breaks:**
   - Newline (`\n`) outside fences and parentheses
   - Whitespace outside fences and parentheses  
   - Hard cut at limit (last resort)
5. **Split code fences if necessary** - Adds closing marker to chunk 1, opening marker to chunk 2
6. **Apply line limit** - If a chunk exceeds `max_lines`, re-split that chunk at line boundaries using the same priority order (paragraph break > newline > hard cut). This is a single re-split pass — no cascading.
7. **Sanity check** - After all splitting, verify that no chunk exceeds 2000 characters. If any chunk is still over the limit, return an error rather than sending invalid data to Discord.

**Key Features:**
- ✅ Never breaks mid-code-block (preserves syntax)
- ✅ Never breaks inside parentheses (preserves function calls)
- ✅ Prefers natural breaks (paragraphs > sentences > words)
- ✅ Handles edge cases (fence-only content, nested fences, empty/null content)
- ✅ Fails safely if chunking is impossible (e.g., 2000+ char single line)

**Known Limitation:**
- If a chunk after line limit re-splitting **still** exceeds `max_lines` (e.g., 100 lines of dense code where each re-split chunk has 60+ lines), the proxy will accept it and send it anyway. This is rare and only impacts line count, not character limits (which have strict validation).

## Content-Type Handling

The proxy supports two Content-Types:

1. **`application/json`** - Parsed and chunked
2. **`multipart/form-data`** - Passthrough (file uploads)

All other Content-Types (including `application/x-www-form-urlencoded`) return **415 Unsupported Media Type**.

```typescript
function validateContentType(request: Request): string | null {
  const ct = request.headers.get('Content-Type') || '';
  
  if (ct.startsWith('application/json')) return 'json';
  if (ct.startsWith('multipart/form-data')) return 'multipart';
  
  return null; // Unsupported
}
```

**Multipart passthrough** forwards `thread_id` and `wait` query params to Discord unchanged. No body inspection or chunking is performed.

**Input Size Limit:** JSON requests exceeding 100KB (checked after reading the body, not via `Content-Length` header) return **413 Payload Too Large**. Multipart requests are not size-checked by the proxy (Discord enforces its own limits).

## Discord Integration

### Forwarding `thread_id`

When the incoming request includes `?thread_id=...` as a **query parameter**, it **must** be preserved on every chunk sent to Discord. Each chunk POST appends `?thread_id={id}` to the Discord webhook URL (this is how Discord's webhook API accepts it). This ensures all chunks land in the correct thread.

**Note:** `thread_id` in the JSON body is **ignored**. Only the query string value is forwarded.

```typescript
function buildDiscordUrl(
  webhookId: string, webhookToken: string, 
  threadId?: string, wait?: boolean
): string {
  const params: string[] = [];
  
  // Three states: true (explicit), false (explicit), undefined (omit - Discord defaults to false)
  if (wait === true) params.push('wait=true');
  if (wait === false) params.push('wait=false');
  if (threadId) params.push(`thread_id=${threadId}`);
  
  const base = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}`;
  return params.length > 0 ? `${base}?${params.join('&')}` : base;
}
```

### The `wait` Parameter

The proxy uses `?wait` selectively when sending chunks to Discord:
- **First chunk:** Sent with `?wait=true` if the caller requested it, so the proxy can capture the Discord message object for the response
- **Subsequent chunks:** Sent **without** `?wait` (Discord's default is `wait=false`) since the response bodies aren't needed
- `?wait=false` or omitted → All chunks sent without `?wait`, proxy returns empty response (matches Discord's behavior)

This minimizes unnecessary response body processing on Discord's side while still returning the first message object when requested. The proxy is a drop-in replacement — responses are identical to what Discord returns for single-message sends.

### Rate Limit Handling

**Proactive rate limit tracking with retry fallback:**

1. **Track `X-RateLimit-Remaining` and `X-RateLimit-Reset-After`** from each Discord response
2. When `X-RateLimit-Remaining` reaches **1** and there are **more chunks to send**, preemptively `sleep()` for the duration indicated by `X-RateLimit-Reset-After` (or 2000ms fallback) before sending the next chunk
3. **Rate limit errors (429):** Read `Retry-After` header, sleep, and retry **once**
4. **Other errors (400, 403, 404, 500, etc.):** Sleep 1000ms and retry **once**
5. If the retry also fails, stop and return partial results

This approach stays under Discord's 5-per-2s webhook rate limit for typical payloads while avoiding unnecessary delays for short messages. Non-transient errors get a single retry to handle temporary network issues.

```typescript
interface RateLimitState {
  remaining: number | null;
  resetAfterMs: number | null;
}

function updateRateLimitState(response: Response): RateLimitState {
  const remaining = response.headers.get('X-RateLimit-Remaining');
  const resetAfter = response.headers.get('X-RateLimit-Reset-After');
  return {
    remaining: remaining !== null ? parseInt(remaining) : null,
    resetAfterMs: resetAfter !== null ? parseFloat(resetAfter) * 1000 : null,
  };
}

async function sendChunks(
  chunks: DiscordWebhookPayload[],
  webhookId: string,
  webhookToken: string,
  threadId?: string,
  wait?: boolean
): Promise<SendResult> {
  let firstMessageObject: any = null;
  let rateLimit: RateLimitState = { remaining: null, resetAfterMs: null };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirst = i === 0;
    const hasMoreChunks = i < chunks.length - 1;

    // Only first chunk uses wait=true (if caller requested it)
    const chunkWait = isFirst && wait;
    const webhookUrl = buildDiscordUrl(webhookId, webhookToken, threadId, chunkWait);

    // Preemptive delay when near rate limit AND more chunks remain
    if (rateLimit.remaining !== null && rateLimit.remaining <= 1 && hasMoreChunks) {
      const delay = rateLimit.resetAfterMs ?? 2000;
      await sleep(delay);
    }

    let response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chunk),
    });

    // Single retry for any error
    if (!response.ok) {
      let delayMs = 1000; // Default retry delay

      // Use Retry-After header for 429s
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        delayMs = retryAfter ? parseFloat(retryAfter) * 1000 : 1000;
      }

      // Drain error response body before retrying
      await response.text();
      await sleep(delayMs);

      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        await response.text(); // Drain retry error body
        return { 
          success: false, 
          firstMessageObject, 
          chunksSent: i,
          chunksTotal: chunks.length
        };
      }
    }

    rateLimit = updateRateLimitState(response);

    // Capture first message object if wait=true; drain all other response bodies
    if (chunkWait) {
      firstMessageObject = await response.json();
    } else {
      await response.text(); // Drain response body to free connection
    }
  }

  return { 
    success: true, 
    firstMessageObject,
    chunksSent: chunks.length,
    chunksTotal: chunks.length
  };
}
```

### Response Format

The proxy returns **Discord's exact response schema** to be a drop-in replacement.

```typescript
// Success (with wait=true) - Returns Discord message object from FIRST chunk
{
  "id": "123456789",
  "type": 0,
  "content": "First chunk content...",
  "channel_id": "987654321",
  "author": {
    "id": "webhook_id",
    "username": "Webhook Name",
    "avatar": null,
    "discriminator": "0000",
    "bot": true
  },
  "timestamp": "2026-02-09T23:45:00.000000+00:00",
  // ... other Discord message fields
}

// Success (with wait=false) - Empty response (matches Discord)
// HTTP 204 No Content or empty body

// Partial failure (some chunks sent, then error) - Custom error response
{
  "error": "Discord API error: 500 after retry",
  "chunks_sent": 1,
  "chunks_total": 3,
  "first_message_id": "123456789"  // ID of first successful chunk
}

// Validation error (400/413/415)
{
  "error": "Payload exceeds 100KB limit"
}

// Chunking impossible (chunk exceeds 2000 chars)
{
  "error": "Unable to chunk: resulting chunk exceeds 2000 character limit"
}
```

**Key behavior:** When `wait=true`, the proxy returns the Discord message object from the **first chunk only**. This matches Discord's single-message webhook behavior exactly, making the proxy transparent to callers.

## Usage Examples

### Replace Discord Webhook URL

**Before (direct):**
```bash
curl -X POST https://discord.com/api/webhooks/123/token \
  -H "Content-Type: application/json" \
  -d '{"content": "very long message..."}'
```

**After (via proxy):**
```bash
curl -X POST https://discord-chunker.workers.dev/api/webhook/123/token \
  -H "Content-Type: application/json" \
  -d '{"content": "very long message..."}'
```

### With Custom Config

```bash
curl -X POST "https://discord-chunker.workers.dev/api/webhook/123/token?max_chars=1500&max_lines=20" \
  -H "Content-Type: application/json" \
  -d '{"content": "very long message..."}'
```

### With Thread ID

```bash
curl -X POST "https://discord-chunker.workers.dev/api/webhook/123/token?thread_id=987654321" \
  -H "Content-Type: application/json" \
  -d '{"content": "very long message..."}'
```

### From GitHub Actions

```yaml
- name: Send to Discord
  run: |
    curl -X POST "https://discord-chunker.workers.dev/api/webhook/${{ secrets.WEBHOOK_ID }}/${{ secrets.WEBHOOK_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d "{\"content\": \"$(cat build-log.txt)\"}"
```

## Implementation Details

### TypeScript Types

```typescript
export interface DiscordWebhookPayload {
  content?: string | null;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  // ... other embed fields
}

export interface ChunkerConfig {
  max_chars: number;
  max_lines: number;
}

export interface SendResult {
  success: boolean;
  firstMessageObject: any | null;  // Discord message object from first chunk (null when wait=false or on error)
  chunksSent: number;
  chunksTotal: number;
}
```

### Worker Entry Point

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);

    // Route: /api/webhook/{id}/{token}
    const match = url.pathname.match(/^\/api\/webhook\/(\d+)\/([^\/]+)$/);
    if (!match) {
      return new Response('Invalid path. Use: /api/webhook/{id}/{token}',
        { status: 404 });
    }

    const [_, webhookId, webhookToken] = match;

    // Validate Content-Type
    const contentType = validateContentType(request);
    if (!contentType) {
      return new Response(JSON.stringify({ 
        error: 'Unsupported Content-Type. Use application/json or multipart/form-data' 
      }), { status: 415, headers: { 'Content-Type': 'application/json' } });
    }

    // Multipart passthrough (file uploads)
    // Forwards thread_id and wait query params to Discord
    if (contentType === 'multipart') {
      return passthroughToDiscord(request, webhookId, webhookToken, url.searchParams);
    }

    // Read body and enforce size limit (100KB)
    const body = await request.text();
    if (body.length > 102400) {
      return new Response(JSON.stringify({ error: 'Payload exceeds 100KB limit' }),
        { status: 413, headers: { 'Content-Type': 'application/json' } });
    }

    const config = parseConfig(url.searchParams);

    const validationError = validateConfig(config);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return handleWebhook(request, webhookId, webhookToken, config);
  }
}
```

## Deployment

### Cloudflare Workers

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Deploy
wrangler deploy
```

### Custom Domain (Optional)

```toml
# wrangler.toml
name = "discord-chunker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[routes]
pattern = "chunker.yourdomain.com/*"
```

## Testing Strategy

1. **Unit tests** - Chunking logic with various inputs
2. **Integration tests** - Mock Discord API responses (including rate limit headers)
3. **End-to-end tests** - Real Discord webhook (test server)

**Test cases:**
- Short content (passthrough)
- Long plain text (chunking)
- Content with code blocks (fence preservation)
- Content with embeds (passthrough)
- Multipart/form-data request (passthrough, no parsing)
- Empty content (`""`, passthrough)
- Null content (`null`, passthrough)
- Missing content field (`{}`, passthrough)
- Invalid config (400 error)
- Unsupported Content-Type (415 error)
- Payload exceeding 100KB (413 error)
- Discord 429 → single retry succeeds
- Discord 429 → single retry also fails (partial result)
- Discord 400/403/500 → retry once after 1000ms
- `X-RateLimit-Remaining: 1` + more chunks → preemptive delay
- `X-RateLimit-Remaining: 1` + last chunk → no delay
- Nested parentheses (no mid-break)
- `thread_id` from query param preserved across all chunks
- `wait=false` → returns empty response (matches Discord)
- `wait=true` → returns Discord message object from first chunk only
- `max_lines` exceeded in a single chunk (re-split at line boundaries)
- Very long single line (hard cut fallback)
- Chunk exceeds 2000 chars after splitting → error response
- Final chunk sanity check passes (all chunks ≤ 2000 chars)

## Limitations & Future Work

### Current Limitations

1. **Embeds bypass chunking** - User must ensure embed payloads are within limits
2. **Multipart passthrough** - File upload requests are forwarded without inspection; chunking only applies to JSON payloads
3. **Single retry on errors** - Second failure returns partial results (acceptable for MVP)
4. **No authentication** - Webhook URL is the auth (standard for webhooks)
5. **No usage analytics** - Stateless by design
6. **100KB input limit** - Larger payloads are rejected (prevents abuse)
7. **Limited Content-Type support** - Only `application/json` and `multipart/form-data` are supported
8. **Line limit re-split limitation** - If a chunk after line-limit re-splitting still exceeds `max_lines`, it will be sent anyway (only affects line count, not character limits)

### Future Enhancements (Out of Scope)

1. **Embed description chunking** - Split long embed descriptions across messages
2. **Multi-retry with exponential backoff** - More resilient rate limit handling
3. **Usage dashboard** - Track requests via CF Analytics
4. **Webhook signature validation** - For supported platforms (GitHub, etc.)

## Success Metrics

- ✅ Handles 95%+ of long message cases (plain text)
- ✅ Zero message loss (all chunks delivered)
- ✅ <500ms overhead per chunk (fast proxying)
- ✅ Preserves code blocks 100% of the time
- ✅ Respects Discord rate limits (no bans)

## References

- [OpenClaw Chunking Implementation](https://github.com/openclaw/openclaw/blob/main/src/auto-reply/chunk.ts)
- [Discord Webhook Documentation](https://discord.com/developers/docs/resources/webhook)
- [Discord Rate Limits](https://discord.com/developers/docs/topics/rate-limits)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)

---

**Design Status:** ✅ Complete and ready for implementation
