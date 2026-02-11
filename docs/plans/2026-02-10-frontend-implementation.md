# Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an interactive single-page frontend at `/chunker` that lets developers convert webhook URLs, preview chunking via dry run, send live messages, and copy curl commands. Themed like an official Discord tool with pixel-perfect Discord message cards.

**Architecture:** The frontend is a single HTML file with inlined CSS/JS, built by esbuild from TypeScript source in `web/`. The chunking logic is shared between the worker and frontend via direct imports. The worker serves the built HTML at `GET /chunker` and redirects `GET /` to `/chunker`. The "Send" feature uses same-origin requests to `/api/webhook/:id/:token` — no CORS needed.

**Tech Stack:** TypeScript, esbuild (bundler), vanilla DOM (no framework), existing Biome/Vitest/Cloudflare Workers toolchain.

**Design doc:** `docs/plans/2026-02-10-frontend-design.md`

**Design direction:** Official Discord tool aesthetic. The page should feel like it belongs in Discord's ecosystem — same dark theme, same visual language, same attention to detail.

**Design tokens (Discord):**
- Background primary: `#313338` (chat area)
- Background secondary: `#2b2d31` (sidebar/cards)
- Background tertiary: `#1e1f22` (page bg)
- Brand/Blurple: `#5865F2`
- Green (success): `#57F287`
- Red (error): `#ED4245`
- Yellow (warning): `#FEE75C`
- Text primary: `#f2f3f5`
- Text secondary: `#b5bac1`
- Text muted: `#949ba4`
- Font: `"gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif`
- Message font size: `16px` (1rem)
- Border radius (cards): `8px`
- Border radius (buttons): `3px`

---

### Task 1: Project Scaffolding — esbuild + build script

**Files:**
- Create: `web/app.ts` (minimal entry point)
- Create: `web/build.ts` (esbuild build script)
- Create: `web/index.html` (HTML shell template)
- Modify: `package.json` (add esbuild dep, add `build:web` script, update `build` script)
- Modify: `tsconfig.json` (include `web/**/*.ts`)
- Modify: `biome.json` (include `web/**`)

**Step 1: Install esbuild**

Run: `pnpm add -D esbuild`

**Step 2: Create minimal `web/app.ts`**

```typescript
// web/app.ts — Frontend entry point
console.log("discord-chunker frontend loaded");
```

**Step 3: Create `web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>discord-chunker</title>
  <style>/* __INJECTED_CSS__ */</style>
</head>
<body>
  <div id="app"></div>
  <script>/* __INJECTED_JS__ */</script>
</body>
</html>
```

**Step 4: Create `web/build.ts`**

This script uses esbuild to bundle `web/app.ts` into a single JS string, then injects it into `web/index.html`, outputting a self-contained `dist/chunker.html`.

```typescript
// web/build.ts
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

async function build() {
  const result = await esbuild.build({
    entryPoints: ["web/app.ts"],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2022"],
    write: false,
  });

  const js = result.outputFiles[0].text;
  const html = readFileSync("web/index.html", "utf-8");
  const output = html.replace("/* __INJECTED_JS__ */", js);

  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/chunker.html", output);
  console.log(`Built dist/chunker.html (${output.length} bytes)`);
}

build();
```

**Step 5: Update `package.json`**

Add to scripts:
```json
"build:web": "tsx web/build.ts",
"build": "pnpm build:web"
```

Add dev dependency: `tsx` (to run the build script with TypeScript).

Run: `pnpm add -D tsx`

**Step 6: Update `tsconfig.json`**

- Main `tsconfig.json` include: `["src/**/*.ts", "test/**/*.ts", "web/**/*.ts"]`, exclude: `["web/build.ts"]`
- `web/build.ts` runs via `tsx` which uses its own TS resolution

**Step 7: Update `biome.json`**

Change `files.includes` to: `["src/**", "test/**", "web/**"]`

**Step 8: Run the build and verify**

Run: `pnpm build:web`
Expected: `dist/chunker.html` created with the console.log embedded.

**Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold frontend build pipeline with esbuild"
```

---

### Task 2: Worker Routes — serve HTML + redirect

**Files:**
- Create: `src/html.ts` (exports the built HTML as a string constant — generated at build time)
- Modify: `web/build.ts` (also generate `src/html.ts` with the HTML inlined)
- Modify: `src/index.ts` (add `GET /`, `GET /chunker` routes)
- Create: `test/routes.test.ts` (test new routes)

**Step 1: Write failing tests for new routes**

```typescript
// test/routes.test.ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src/index";

describe("Frontend routes", () => {
  it("GET / redirects to /chunker", async () => {
    const req = new Request("https://discord.git.ci/");
    const ctx = createExecutionContext();
    const resp = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(resp.status).toBe(301);
    expect(resp.headers.get("Location")).toBe("/chunker");
  });

  it("GET /chunker returns HTML", async () => {
    const req = new Request("https://discord.git.ci/chunker");
    const ctx = createExecutionContext();
    const resp = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("text/html");
    const body = await resp.text();
    expect(body).toContain("<!DOCTYPE html>");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: New tests FAIL (routes don't exist yet).

**Step 3: Update `web/build.ts` to generate `src/html.ts`**

After writing `dist/chunker.html`, also write:
```typescript
// Add to web/build.ts after writing dist/chunker.html:
const escaped = output.replace(/`/g, "\\`").replace(/\$/g, "\\$");
writeFileSync(
  "src/html.ts",
  `// AUTO-GENERATED by web/build.ts — do not edit\nexport const CHUNKER_HTML = \`${escaped}\`;\n`,
);
console.log("Generated src/html.ts");
```

**Step 4: Run build to generate `src/html.ts`**

Run: `pnpm build:web`

**Step 5: Add routes to `src/index.ts`**

In the `handleRequest` method, add before the health check:

```typescript
import { CHUNKER_HTML } from "./html";

// At the top of handleRequest, before health check:
if (url.pathname === "/" && request.method === "GET") {
  return Response.redirect(`${url.origin}/chunker`, 301);
}

if (url.pathname === "/chunker" && request.method === "GET") {
  return new Response(CHUNKER_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

**Step 6: Add `src/html.ts` to `.gitignore`**

Append: `src/html.ts` (auto-generated file).

**Step 7: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests pass (existing 68 + new route tests).

**Step 8: Commit**

```bash
git add -A
git commit -m "feat: add frontend routes (/, /chunker) for serving frontend"
```

---

### Task 3: Shared Chunker — browser-compatible export

**Files:**
- Create: `web/chunker.ts` (thin wrapper that re-exports chunker + config for browser use)
- Create: `test/web-chunker.test.ts`

**Step 1: Create `web/chunker.ts`**

```typescript
// web/chunker.ts — Re-export chunking logic for browser use
export { chunkContent } from "../src/chunker";
export { parseConfig } from "../src/config";
export type { ChunkerConfig } from "../src/types";
export { DEFAULT_MAX_CHARS, DEFAULT_MAX_LINES } from "../src/types";
```

**Step 2: Verify esbuild can bundle the shared code**

Run: `pnpm build:web`
Expected: Build succeeds without errors (esbuild resolves the imports from `src/`).

**Step 3: Write a test that the chunker works in the web bundle context**

```typescript
// test/web-chunker.test.ts
import { describe, it, expect } from "vitest";
import { chunkContent } from "../src/chunker";
import { parseConfig } from "../src/config";

describe("Shared chunker (web compatibility)", () => {
  it("chunks long content with default config", () => {
    const config = parseConfig(new URLSearchParams());
    const longContent = "A".repeat(2500);
    const chunks = chunkContent(longContent, config);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
  });

  it("preserves code fences across chunks", () => {
    const config = parseConfig(new URLSearchParams());
    const content = "Hello\n\n" + "```js\n" + "x\n".repeat(200) + "```\n\nEnd";
    const chunks = chunkContent(content, config);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const opens = (chunk.match(/```/g) || []).length;
      expect(opens % 2).toBe(0);
    }
  });
});
```

**Step 4: Run tests**

Run: `pnpm test`
Expected: All pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add browser-compatible chunker re-export for frontend"
```

---

### Task 4: URL Converter Component

**Files:**
- Create: `web/url-converter.ts` (URL conversion logic)
- Create: `test/web-url-converter.test.ts` (unit tests)

**Step 1: Write failing tests**

```typescript
// test/web-url-converter.test.ts
import { describe, it, expect } from "vitest";
import { convertWebhookUrl, isValidWebhookUrl } from "../web/url-converter";

describe("URL Converter", () => {
  it("converts discord.com webhook URL to proxy URL", () => {
    const input = "https://discord.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("handles discordapp.com variant", () => {
    const input = "https://discordapp.com/api/webhooks/123456/abctoken";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123456/abctoken");
  });

  it("returns null for invalid URLs", () => {
    expect(convertWebhookUrl("not a url")).toBeNull();
    expect(convertWebhookUrl("https://google.com/webhooks/123/token")).toBeNull();
    expect(convertWebhookUrl("")).toBeNull();
  });

  it("validates webhook URLs", () => {
    expect(isValidWebhookUrl("https://discord.com/api/webhooks/123/token")).toBe(true);
    expect(isValidWebhookUrl("https://not-discord.com/api/webhooks/123/token")).toBe(false);
    expect(isValidWebhookUrl("garbage")).toBe(false);
  });

  it("preserves query params", () => {
    const input = "https://discord.com/api/webhooks/123/token?wait=true&thread_id=456";
    const result = convertWebhookUrl(input);
    expect(result).toBe("https://discord.git.ci/api/webhook/123/token?wait=true&thread_id=456");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`

**Step 3: Implement `web/url-converter.ts`**

```typescript
// web/url-converter.ts
const WEBHOOK_REGEX = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/(\d+)\/([^/?]+)(.*)?$/;

export function isValidWebhookUrl(url: string): boolean {
  return WEBHOOK_REGEX.test(url);
}

export function convertWebhookUrl(url: string): string | null {
  const match = url.match(WEBHOOK_REGEX);
  if (!match) return null;
  const [, , id, token, rest] = match;
  return `https://discord.git.ci/api/webhook/${id}/${token}${rest || ""}`;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add URL converter logic for webhook URL transformation"
```

---

### Task 5: Curl Generator

**Files:**
- Create: `web/curl-generator.ts`
- Create: `test/web-curl-generator.test.ts`

**Step 1: Write failing tests**

```typescript
// test/web-curl-generator.test.ts
import { describe, it, expect } from "vitest";
import { generateCurl } from "../web/curl-generator";

describe("Curl Generator", () => {
  it("generates a valid curl command", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "Hello world");
    expect(result).toContain("curl -X POST");
    expect(result).toContain("https://discord.git.ci/api/webhook/123/token");
    expect(result).toContain("Content-Type: application/json");
    expect(result).toContain("Hello world");
  });

  it("escapes single quotes in content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "it's a test");
    expect(result).toContain("it\\'s a test");
  });

  it("handles multiline content", () => {
    const result = generateCurl("https://discord.git.ci/api/webhook/123/token", "line1\nline2");
    expect(result).toContain("line1\\nline2");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`

**Step 3: Implement `web/curl-generator.ts`**

```typescript
// web/curl-generator.ts
export function generateCurl(proxyUrl: string, content: string): string {
  const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  return [
    `curl -X POST '${proxyUrl}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '{"content": "${escaped}"}'`,
  ].join(" \\\n");
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: add curl command generator for webhook requests"
```

---

### Task 6: Frontend App — DOM Wiring + Discord Theme

**Files:**
- Modify: `web/app.ts` (full app logic — DOM creation, event handlers, state)
- Create: `web/styles.ts` (Discord-themed CSS as a string constant)
- Modify: `web/index.html` (semantic structure with Discord theming)
- Modify: `web/build.ts` (inject CSS from styles.ts into HTML)

This is the largest task. The page must look and feel like an official Discord tool.

**Step 1: Create `web/styles.ts` — Discord design system CSS**

All CSS lives here as a template literal, injected at build time. This keeps everything in one typed place and avoids a separate CSS build step.

```typescript
// web/styles.ts — Discord-themed CSS
export const STYLES = `
/* === Discord Design Tokens === */
:root {
  --bg-tertiary: #1e1f22;
  --bg-secondary: #2b2d31;
  --bg-primary: #313338;
  --bg-modifier-hover: #2e3035;
  --bg-modifier-active: #35373c;
  --brand: #5865F2;
  --brand-hover: #4752C4;
  --green: #57F287;
  --green-hover: #3CC267;
  --red: #ED4245;
  --yellow: #FEE75C;
  --text-normal: #dbdee1;
  --text-primary: #f2f3f5;
  --text-secondary: #b5bac1;
  --text-muted: #949ba4;
  --text-link: #00AFF4;
  --border-subtle: #3f4147;
  --border-strong: #4e5058;
  --font-primary: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-code: "Consolas", "Andale Mono WT", "Andale Mono", "Lucida Console",
    "Lucida Sans Typewriter", "DejaVu Sans Mono", "Bitstream Vera Sans Mono",
    "Liberation Mono", "Nimbus Mono L", Monaco, "Courier New", Courier, monospace;
  --radius-sm: 3px;
  --radius-md: 8px;
}

/* === Reset & Base === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 16px; }
body {
  font-family: var(--font-primary);
  background: var(--bg-tertiary);
  color: var(--text-normal);
  line-height: 1.375;
  min-height: 100vh;
}

/* === Layout === */
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

/* === Header === */
.header {
  text-align: center;
  margin-bottom: 3rem;
}
.header-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.header-logo svg { width: 40px; height: 40px; }
.header h1 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
.header .tagline {
  font-size: 1.125rem;
  color: var(--text-secondary);
  max-width: 540px;
  margin: 0 auto;
}

/* === Sections === */
.section {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}
.section-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

/* === Inputs (Discord-style) === */
.input-wrapper { position: relative; }
.dc-input {
  width: 100%;
  padding: 10px 12px;
  font-family: var(--font-primary);
  font-size: 1rem;
  color: var(--text-normal);
  background: var(--bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  outline: none;
  transition: box-shadow 0.15s ease;
}
.dc-input:focus { box-shadow: 0 0 0 2px var(--brand); }
.dc-input::placeholder { color: var(--text-muted); }

.dc-textarea {
  width: 100%;
  padding: 12px;
  font-family: var(--font-code);
  font-size: 0.875rem;
  color: var(--text-normal);
  background: var(--bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  outline: none;
  resize: vertical;
  min-height: 200px;
  line-height: 1.5;
  transition: box-shadow 0.15s ease;
}
.dc-textarea:focus { box-shadow: 0 0 0 2px var(--brand); }

/* === Buttons (Discord-style) === */
.dc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 8px 16px;
  font-family: var(--font-primary);
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.17s ease, color 0.17s ease;
  white-space: nowrap;
}
.dc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dc-btn-brand { background: var(--brand); color: #fff; }
.dc-btn-brand:hover:not(:disabled) { background: var(--brand-hover); }
.dc-btn-green { background: var(--green); color: #000; }
.dc-btn-green:hover:not(:disabled) { background: var(--green-hover); }
.dc-btn-secondary { background: var(--bg-modifier-active); color: var(--text-normal); }
.dc-btn-secondary:hover:not(:disabled) { background: var(--border-strong); }
.dc-btn-outline {
  background: transparent;
  color: var(--text-normal);
  border: 1px solid var(--border-strong);
}
.dc-btn-outline:hover:not(:disabled) { background: var(--bg-modifier-hover); }

/* === URL Converter Output === */
.converted-output {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 10px 12px;
  margin-top: 0.75rem;
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--brand);
}
.converted-output code {
  flex: 1;
  font-family: var(--font-code);
  font-size: 0.875rem;
  color: var(--text-link);
  word-break: break-all;
}

/* === Action Bar === */
.actions {
  display: flex;
  gap: 0.5rem;
  margin: 1rem 0;
  flex-wrap: wrap;
}

/* === Discord Message Cards (pixel-perfect) === */
.chunk-results { margin-top: 1rem; }
.chunk-count {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  margin-bottom: 0.75rem;
}

.dc-message {
  display: flex;
  padding: 0.125rem 1rem 0.125rem 4.5rem;
  position: relative;
  min-height: 2.75rem;
  margin-top: 1.0625rem;
}
.dc-message:hover { background: var(--bg-modifier-hover); }

.dc-message-avatar {
  position: absolute;
  left: 1rem;
  top: 0.125rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dc-message-avatar svg { width: 24px; height: 24px; fill: #fff; }

.dc-message-content { flex: 1; min-width: 0; }

.dc-message-header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  line-height: 1.375;
}
.dc-message-username {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
}
.dc-message-username:hover { text-decoration: underline; }
.dc-message-tag {
  font-size: 0.625rem;
  font-weight: 500;
  background: var(--brand);
  color: #fff;
  padding: 0.0625rem 0.275rem;
  border-radius: 0.1875rem;
  text-transform: uppercase;
  vertical-align: top;
  position: relative;
  top: 0.1rem;
}
.dc-message-timestamp {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 400;
}

.dc-message-body {
  font-size: 1rem;
  line-height: 1.375;
  color: var(--text-normal);
  white-space: pre-wrap;
  word-break: break-word;
  overflow-wrap: break-word;
}

.dc-message-chunk-badge {
  display: inline-block;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 0.5rem;
  vertical-align: middle;
}

/* Message group container — mimics Discord chat area */
.dc-message-group {
  background: var(--bg-primary);
  border-radius: var(--radius-md);
  padding: 0.5rem 0;
  overflow: hidden;
}

/* Subsequent messages in group (no avatar/header) */
.dc-message-continuation {
  padding: 0.125rem 1rem 0.125rem 4.5rem;
  min-height: auto;
  margin-top: 0;
}
.dc-message-continuation .dc-message-body {
  padding-top: 0.125rem;
}

/* Chunk separator line */
.dc-chunk-divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  margin: 0.25rem 0;
}
.dc-chunk-divider::before,
.dc-chunk-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}
.dc-chunk-divider span {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  white-space: nowrap;
}

/* === Comparison Animation === */
.animation-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}
@media (max-width: 640px) {
  .animation-container { grid-template-columns: 1fr; }
}

.flow {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  text-align: center;
}
.flow-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}
.flow-steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.flow-step {
  padding: 0.625rem 1rem;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 500;
  width: 100%;
  max-width: 280px;
}
.flow-arrow {
  color: var(--text-muted);
  font-size: 1.25rem;
  line-height: 1;
}
.message-long {
  background: var(--bg-primary);
  color: var(--text-normal);
  border: 1px solid var(--border-subtle);
}
.discord-api, .chunker-proxy {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}
.chunker-proxy { border: 1px solid var(--brand); color: var(--brand); }
.chunks-split { background: var(--bg-tertiary); color: var(--text-secondary); }
.result-error {
  background: rgba(237, 66, 69, 0.1);
  color: var(--red);
  border: 1px solid rgba(237, 66, 69, 0.3);
}
.result-success {
  background: rgba(87, 242, 135, 0.1);
  color: var(--green);
  border: 1px solid rgba(87, 242, 135, 0.3);
}
.result-success div { padding: 0.125rem 0; }

/* Animation keyframes */
.flow-step, .flow-arrow {
  opacity: 0;
  animation: fadeSlideIn 0.4s ease forwards;
}
.flow-steps > :nth-child(1) { animation-delay: 0.1s; }
.flow-steps > :nth-child(2) { animation-delay: 0.3s; }
.flow-steps > :nth-child(3) { animation-delay: 0.5s; }
.flow-steps > :nth-child(4) { animation-delay: 0.7s; }
.flow-steps > :nth-child(5) { animation-delay: 0.9s; }
.flow-steps > :nth-child(6) { animation-delay: 1.1s; }
.flow-steps > :nth-child(7) { animation-delay: 1.3s; }

@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === Status Toast === */
.status-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%) translateY(100%);
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-size: 0.875rem;
  font-weight: 500;
  opacity: 0;
  transition: transform 0.3s ease, opacity 0.3s ease;
  z-index: 1000;
  pointer-events: none;
}
.status-toast.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}
.status-toast.success { background: var(--green); color: #000; }
.status-toast.error { background: var(--red); color: #fff; }

/* === Footer === */
.footer {
  text-align: center;
  padding-top: 2rem;
  color: var(--text-muted);
  font-size: 0.8125rem;
}
.footer a {
  color: var(--text-link);
  text-decoration: none;
}
.footer a:hover { text-decoration: underline; }

/* === Responsive === */
@media (max-width: 768px) {
  .page { padding: 1.5rem 1rem; }
  .header h1 { font-size: 1.5rem; }
  .header .tagline { font-size: 1rem; }
  .section { padding: 1.25rem; }
  .dc-message { padding-left: 3.5rem; }
  .dc-message-avatar { width: 32px; height: 32px; }
}
`;
```

**Step 2: Implement `web/app.ts`**

Full app logic with Discord-themed DOM structure:

```typescript
// web/app.ts
import { chunkContent } from "../src/chunker";
import { parseConfig } from "../src/config";
import { convertWebhookUrl, isValidWebhookUrl } from "./url-converter";
import { generateCurl } from "./curl-generator";
import { createAnimation } from "./animation";
import type { ChunkerConfig } from "../src/types";

const DEFAULT_EXAMPLE = `# Release Notes v2.5.0

We're excited to announce the latest release with several major improvements to performance and reliability.

## New Features

### Intelligent Message Routing
Messages are now automatically routed through the optimal delivery path based on size and content type. This reduces latency by up to 40% for typical payloads.

### Code Block Preservation
When splitting long messages, code blocks are now preserved intact across chunk boundaries:

\`\`\`typescript
interface WebhookPayload {
  content: string;
  username?: string;
  avatar_url?: string;
  embeds?: Embed[];
}

function processPayload(payload: WebhookPayload): ProcessedMessage[] {
  const chunks = splitContent(payload.content, {
    maxChars: 1950,
    maxLines: 17,
    preserveCodeBlocks: true,
  });

  return chunks.map((chunk, index) => ({
    ...payload,
    content: chunk,
    sequence: index + 1,
    total: chunks.length,
  }));
}
\`\`\`

## Bug Fixes

- Fixed an issue where parenthetical text (like this example, which contains nested (deeply nested) content) could be split at incorrect boundaries
- Resolved edge case with triple backtick fences inside blockquotes
- Corrected byte counting for multi-byte UTF-8 characters (emoji 🎉 and CJK characters now measured correctly)

## Migration Guide

No breaking changes in this release. Simply update your dependency:

\`\`\`bash
npm install discord-chunker@2.5.0
\`\`\`

For users of the hosted proxy, no action is needed — the update is already live at discord.git.ci.

## Performance Benchmarks

| Payload Size | Direct Discord | With Chunker | Overhead |
|-------------|---------------|-------------|----------|
| < 2000 chars | 45ms | 47ms | +2ms |
| 5000 chars | ❌ Error 400 | 142ms (3 chunks) | N/A |
| 10000 chars | ❌ Error 400 | 285ms (6 chunks) | N/A |
| 50000 chars | ❌ Error 400 | 1.2s (26 chunks) | N/A |

Thank you for using discord-chunker! Report issues at https://github.com/wei/discord-chunker/issues`;

// Discord webhook bot avatar SVG (simple bot icon)
const BOT_AVATAR_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;

function getDefaultConfig(): ChunkerConfig {
  return parseConfig(new URLSearchParams());
}

function formatTimestamp(): string {
  const now = new Date();
  return `Today at ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function renderChunks(chunks: string[]): void {
  const container = document.getElementById("chunk-results");
  if (!container) return;
  container.innerHTML = "";

  const count = document.createElement("div");
  count.className = "chunk-count";
  count.textContent = chunks.length === 1
    ? "1 message — no chunking needed"
    : `${chunks.length} messages will be sent`;
  container.appendChild(count);

  const group = document.createElement("div");
  group.className = "dc-message-group";

  const ts = formatTimestamp();

  for (let i = 0; i < chunks.length; i++) {
    // Chunk divider between messages
    if (i > 0) {
      const divider = document.createElement("div");
      divider.className = "dc-chunk-divider";
      divider.innerHTML = `<span>Chunk ${i + 1} of ${chunks.length}</span>`;
      group.appendChild(divider);
    }

    const msg = document.createElement("div");
    msg.className = i === 0 ? "dc-message" : "dc-message dc-message-continuation";

    if (i === 0) {
      msg.innerHTML = `
        <div class="dc-message-avatar">${BOT_AVATAR_SVG}</div>
        <div class="dc-message-content">
          <div class="dc-message-header">
            <span class="dc-message-username">Webhook Bot</span>
            <span class="dc-message-tag">BOT</span>
            <span class="dc-message-timestamp">${ts}</span>
            <span class="dc-message-chunk-badge">${chunks[i].length} chars</span>
          </div>
          <div class="dc-message-body"></div>
        </div>
      `;
    } else {
      msg.innerHTML = `
        <div class="dc-message-content">
          <div class="dc-message-body"></div>
        </div>
      `;
    }

    // Set body text safely (textContent to prevent XSS)
    const body = msg.querySelector(".dc-message-body") as HTMLElement;
    body.textContent = chunks[i];

    group.appendChild(msg);
  }

  container.appendChild(group);
}

function showStatus(message: string, isError: boolean): void {
  let el = document.getElementById("status-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "status-toast";
    el.className = "status-toast";
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `status-toast ${isError ? "error" : "success"} visible`;
  setTimeout(() => { el.classList.remove("visible"); }, 3000);
}

async function copyToClipboard(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showStatus(`${label} copied to clipboard`, false);
  } catch {
    showStatus("Failed to copy to clipboard", true);
  }
}

function init(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = `
    <div class="page">
      <header class="header">
        <div class="header-logo">
          <svg width="40" height="40" viewBox="0 0 127.14 96.36" xmlns="http://www.w3.org/2000/svg">
            <path fill="#5865F2" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
          </svg>
          <h1>discord-chunker</h1>
        </div>
        <p class="tagline">Drop-in Discord webhook proxy that intelligently chunks long messages.</p>
      </header>

      <div id="animation-slot"></div>

      <div class="section" id="url-converter">
        <div class="section-title">Convert Your Webhook URL</div>
        <input type="text" class="dc-input" id="webhook-url"
          placeholder="https://discord.com/api/webhooks/..." />
        <div id="converted-url-group" class="converted-output" style="display:none">
          <code id="converted-url"></code>
          <button class="dc-btn dc-btn-secondary" id="copy-url-btn" type="button">Copy</button>
        </div>
      </div>

      <div class="section" id="playground">
        <div class="section-title">Try It Out</div>
        <textarea class="dc-textarea" id="content-input" rows="12"></textarea>
        <div class="actions">
          <button class="dc-btn dc-btn-brand" id="dry-run-btn" type="button">Dry Run</button>
          <button class="dc-btn dc-btn-green" id="send-btn" type="button">Send</button>
          <button class="dc-btn dc-btn-outline" id="copy-curl-btn" type="button">Copy curl</button>
        </div>
        <div id="chunk-results"></div>
      </div>

      <footer class="footer">
        <a href="https://github.com/wei/discord-chunker" target="_blank" rel="noopener">GitHub</a>
        &nbsp;·&nbsp;
        See README for advanced options (max_chars, max_lines, thread_id, wait)
      </footer>
    </div>
  `;

  // Insert animation
  const animSlot = document.getElementById("animation-slot");
  if (animSlot) animSlot.appendChild(createAnimation());

  // Pre-fill example content
  const contentInput = document.getElementById("content-input") as HTMLTextAreaElement;
  contentInput.value = DEFAULT_EXAMPLE;

  // URL converter
  const webhookInput = document.getElementById("webhook-url") as HTMLInputElement;
  const convertedGroup = document.getElementById("converted-url-group") as HTMLDivElement;
  const convertedUrl = document.getElementById("converted-url") as HTMLElement;

  webhookInput.addEventListener("input", () => {
    const proxy = convertWebhookUrl(webhookInput.value.trim());
    if (proxy) {
      convertedUrl.textContent = proxy;
      convertedGroup.style.display = "flex";
    } else {
      convertedGroup.style.display = "none";
    }
  });

  document.getElementById("copy-url-btn")?.addEventListener("click", () => {
    copyToClipboard(convertedUrl.textContent || "", "Proxy URL");
  });

  // Dry Run
  document.getElementById("dry-run-btn")?.addEventListener("click", () => {
    const content = contentInput.value;
    if (!content.trim()) {
      showStatus("Enter some content first", true);
      return;
    }
    try {
      const config = getDefaultConfig();
      const chunks = chunkContent(content, config);
      renderChunks(chunks);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chunking failed";
      showStatus(msg, true);
    }
  });

  // Send
  document.getElementById("send-btn")?.addEventListener("click", async () => {
    const content = contentInput.value;
    const webhookUrl = webhookInput.value.trim();

    if (!content.trim()) {
      showStatus("Enter some content first", true);
      return;
    }
    if (!isValidWebhookUrl(webhookUrl)) {
      showStatus("Enter a valid Discord webhook URL above to send", true);
      return;
    }

    const match = webhookUrl.match(/webhooks\/(\d+)\/([^/?]+)/);
    if (!match) {
      showStatus("Invalid webhook URL", true);
      return;
    }
    const [, id, token] = match;

    try {
      const resp = await fetch(`/api/webhook/${id}/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (resp.ok || resp.status === 204) {
        showStatus("Message sent successfully!", false);
      } else {
        const body = await resp.text();
        showStatus(`Send failed (${resp.status}): ${body}`, true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      showStatus(`Send failed: ${msg}`, true);
    }
  });

  // Copy curl
  document.getElementById("copy-curl-btn")?.addEventListener("click", () => {
    const content = contentInput.value;
    const webhookUrl = webhookInput.value.trim();

    if (!content.trim()) {
      showStatus("Enter some content first", true);
      return;
    }

    const proxyUrl = isValidWebhookUrl(webhookUrl)
      ? convertWebhookUrl(webhookUrl)
      : "https://discord.git.ci/api/webhook/YOUR_ID/YOUR_TOKEN";

    const curl = generateCurl(proxyUrl || "", content);
    copyToClipboard(curl, "curl command");
  });
}

document.addEventListener("DOMContentLoaded", init);
```

**Step 3: Update `web/build.ts`**

Add CSS injection from `web/styles.ts`:

```typescript
// In build(), after bundling JS, also import and inject CSS:
import { STYLES } from "./styles";
// ...
const output = html
  .replace("/* __INJECTED_CSS__ */", STYLES)
  .replace("/* __INJECTED_JS__ */", js);
```

Note: Since `web/build.ts` runs via `tsx`, it can import `STYLES` directly. The CSS template literal is just a string — no CSS bundler needed.

**Step 4: Update `web/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>discord-chunker — Drop-in Discord webhook proxy</title>
  <meta name="description" content="Drop-in Discord webhook proxy that intelligently chunks long messages. Just swap the URL.">
  <meta name="theme-color" content="#5865F2">
  <style>/* __INJECTED_CSS__ */</style>
</head>
<body>
  <div id="app"></div>
  <script>/* __INJECTED_JS__ */</script>
</body>
</html>
```

**Step 5: Build and verify**

Run: `pnpm build:web`
Open `dist/chunker.html` in a browser — should see Discord-themed dark page.

**Step 6: Run all tests**

Run: `pnpm test`
Expected: All pass.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: implement Discord-themed frontend with pixel-perfect message cards"
```

---

### Task 7: Comparison Animation

**Files:**
- Create: `web/animation.ts` (animation component)

**Step 1: Implement `web/animation.ts`**

```typescript
// web/animation.ts
export function createAnimation(): HTMLElement {
  const container = document.createElement("div");
  container.className = "animation-container";
  container.innerHTML = `
    <div class="flow flow-direct">
      <div class="flow-label">Direct to Discord</div>
      <div class="flow-steps">
        <div class="flow-step message-long">📝 Long message (5000 chars)</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step discord-api">Discord API</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step result-error">❌ Error 400 — Content too long</div>
      </div>
    </div>
    <div class="flow flow-proxy">
      <div class="flow-label">Via discord-chunker</div>
      <div class="flow-steps">
        <div class="flow-step message-long">📝 Long message (5000 chars)</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step chunker-proxy">discord.git.ci</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step chunks-split">✂️ Split into 3 chunks</div>
        <div class="flow-arrow">↓</div>
        <div class="flow-step result-success">
          <div>✅ Message 1 delivered</div>
          <div>✅ Message 2 delivered</div>
          <div>✅ Message 3 delivered</div>
        </div>
      </div>
    </div>
  `;
  return container;
}
```

CSS animations are already defined in `web/styles.ts` (staggered `fadeSlideIn` on `.flow-step` and `.flow-arrow`).

**Step 2: Build and verify**

Run: `pnpm build:web`
Verify animation renders with staggered fade-in.

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: add comparison animation component (direct vs proxy flow)"
```

---

### Task 8: Build Integration & CI

**Files:**
- Modify: `package.json` (ensure `build` script runs web build)
- Modify: `.github/workflows/ci.yml` (add build step before tests)
- Modify: `.gitignore` (ensure `dist/` and `src/html.ts` are ignored)

**Step 1: Update `package.json` scripts**

```json
"build:web": "tsx web/build.ts",
"build": "pnpm build:web",
"dev": "pnpm build:web && wrangler dev",
"deploy": "pnpm build:web && wrangler deploy"
```

**Step 2: Update `.github/workflows/ci.yml`**

Add a build step before typecheck and test:

```yaml
      - name: Build
        run: pnpm build

      - name: Lint & Format
        run: pnpm run lint

      - name: Typecheck
        run: pnpm tsc --noEmit

      - name: Test
        run: pnpm test
```

**Step 3: Update `.gitignore`**

Ensure these are present:
```
dist/
src/html.ts
```

**Step 4: Verify full pipeline locally**

Run:
```bash
pnpm build
pnpm run lint
pnpm tsc --noEmit
pnpm test
```

Expected: All pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: integrate frontend build into CI, dev, and deploy pipelines"
```

---

### Task 9: Final Verification & Cleanup

**Step 1: Run dev server**

Run: `pnpm dev`
Open: `http://localhost:8787/` → should redirect to `/chunker`
Open: `http://localhost:8787/chunker` → full Discord-themed page

**Step 2: Manual smoke test**

1. Paste a webhook URL → see converted proxy URL with blurple left border → copy works
2. Click Dry Run with default content → see pixel-perfect Discord message cards with avatar, username, BOT tag, timestamps, chunk dividers
3. Click Copy curl → valid curl command in clipboard
4. Comparison animation plays with staggered fade-in
5. Toast notifications appear at bottom center
6. (Optional) Paste real webhook URL → click Send → messages appear in Discord

**Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (original 68 + new tests).

**Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat: discord-chunker frontend v1 complete"
git push
```
