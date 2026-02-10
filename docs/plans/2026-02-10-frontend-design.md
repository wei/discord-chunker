# Frontend Design — discord-chunker

**Date:** 2026-02-10
**Status:** Approved
**Production URL:** https://discord.git.ci/chunker

## Overview

A single-page static website served at `/chunker` that lets developers learn about discord-chunker and try it interactively. The home route (`/`) redirects to `/chunker`.

## Target Audience

Developers who already use Discord webhooks. No need to explain what webhooks are — focus on what this proxy does and let them try it.

## Functional Requirements

### 1. URL Converter

- Text input where users paste their Discord webhook URL (e.g. `https://discord.com/api/webhooks/123/token`)
- Instantly displays the equivalent proxy URL (`https://discord.git.ci/api/webhook/123/token`)
- One-click copy button for the proxy URL

### 2. Interactive Playground

- **Textarea** pre-loaded with a mixed-content example (paragraphs interspersed with fenced code blocks) that exceeds 2000 characters
- User can freely edit or paste their own content over the example
- **Two action buttons with a unified "send" feel:**
  - **"Dry Run"** — runs the chunking algorithm locally and displays the result as stacked Discord-style message cards, showing exactly what would be sent. No network request. Feels like sending but safe.
  - **"Send"** — fires the current content through the `discord.git.ci` proxy to the user's real Discord channel. Requires a webhook URL.
- Each card in the dry run result represents one chunk/message
- Shows chunk count (e.g. "3 messages")
- Webhook URL input field (can reuse the URL from the converter section) — required for live send, optional for dry run
- Success/error feedback after live send

### 3. Comparison Animation

- Visual animation showing the difference between sending a long message directly to Discord (❌ error / truncation) vs through the proxy (✅ multiple messages delivered successfully)
- Side-by-side or sequential comparison of the two flows

### 4. Copy Curl

- **"Copy curl" button** — generates a `curl` command for the current content targeting the proxy URL and copies it to clipboard
- Example output:
  ```bash
  curl -X POST https://discord.git.ci/api/webhook/123/token \
    -H "Content-Type: application/json" \
    -d '{"content": "..."}'
  ```

### 5. GitHub Link

- Link to the GitHub repo / README for advanced configuration options (max_chars, max_lines, thread_id, wait, file uploads, etc.)

## Project Setup & Integration

The frontend must integrate seamlessly into the existing Cloudflare Worker project — no separate repo, no separate build pipeline.

### Structure

- Frontend source lives in a `web/` directory within the existing project
- The chunking logic (`src/chunker.ts`, `src/config.ts`, `src/types.ts`) is shared between the worker and the frontend — imported directly, not duplicated
- Built frontend assets are inlined or served by the worker (no separate static hosting)

### Build

- Single `pnpm build` command builds both the worker and the frontend
- Frontend bundler (e.g. Vite, esbuild) produces a single HTML file with inlined CSS/JS, or minimal static assets
- The worker serves the built frontend at `GET /chunker` and redirects `GET /` → `/chunker`

### Lint, Format & Typecheck

- Frontend code covered by the existing Biome config (lint + format)
- Frontend TypeScript covered by the existing `tsc --noEmit` typecheck
- Shared `tsconfig.json` or a project-references setup so both worker and web code are checked together

### Testing

- Frontend-specific tests (chunker integration, URL conversion logic) run alongside existing tests via Vitest
- Existing 68 worker tests remain unchanged

### CI

- Existing GitHub Actions workflow (`.github/workflows/ci.yml`) covers the frontend automatically — same `tsc --noEmit` + `npm test` pipeline
- No separate CI job needed

### Deploy

- Cloudflare Workers Builds deploys everything as one unit — worker + frontend assets together
- No separate deploy step for the frontend

## Out of Scope

- Configurable parameters UI (max_chars, max_lines, etc.) — defaults only
- File upload demonstration
- Rate limit / retry behavior showcase
- Design and aesthetics (handled separately with a design skill)

## Technical Notes

- The chunking logic must run client-side in the browser for the dry run feature (shared source, bundled for browser)
- The "Send" feature makes a real POST request to `discord.git.ci` from the browser (CORS must be handled by the worker)
- Route structure:
  - `GET /` → redirect to `/chunker`
  - `GET /chunker` → serve the static page
  - `POST /api/webhook/:id/:token` → existing proxy (unchanged)
  - `GET /health` → existing health endpoint (unchanged)
