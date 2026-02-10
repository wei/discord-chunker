// web/app.ts
import { createAnimation } from "./animation";
import type { ChunkerConfig } from "./chunker";
import { chunkContent, parseConfig } from "./chunker";
import { generateCurl } from "./curl-generator";
import { convertWebhookUrl, extractWebhookParts, isValidWebhookUrl } from "./url-converter";

const DEFAULT_EXAMPLE = [
  "# Release Notes v2.5.0",
  "",
  "We're excited to announce the latest release with several major improvements to performance and reliability.",
  "",
  "## New Features",
  "",
  "### Intelligent Message Routing",
  "Messages are now automatically routed through the optimal delivery path based on size and content type. This reduces latency by up to 40% for typical payloads.",
  "",
  "### Code Block Preservation",
  "When splitting long messages, code blocks are now preserved intact across chunk boundaries:",
  "",
  "```typescript",
  "interface WebhookPayload {",
  "  content: string;",
  "  username?: string;",
  "  avatar_url?: string;",
  "  embeds?: Embed[];",
  "}",
  "",
  "function processPayload(payload: WebhookPayload): ProcessedMessage[] {",
  "  const chunks = splitContent(payload.content, {",
  "    maxChars: 1950,",
  "    maxLines: 17,",
  "    preserveCodeBlocks: true,",
  "  });",
  "",
  "  return chunks.map((chunk, index) => ({",
  "    ...payload,",
  "    content: chunk,",
  "    sequence: index + 1,",
  "    total: chunks.length,",
  "  }));",
  "}",
  "```",
  "",
  "## Bug Fixes",
  "",
  "- Fixed an issue where parenthetical text (like this example, which contains nested (deeply nested) content) could be split at incorrect boundaries",
  "- Resolved edge case with triple backtick fences inside blockquotes",
  "- Corrected byte counting for multi-byte UTF-8 characters (emoji \u{1F389} and CJK characters now measured correctly)",
  "",
  "## Migration Guide",
  "",
  "No breaking changes in this release. Simply update your dependency:",
  "",
  "```bash",
  "npm install discord-chunker@2.5.0",
  "```",
  "",
  "For users of the hosted proxy, no action is needed \u2014 the update is already live at discord.git.ci.",
  "",
  "## Performance Benchmarks",
  "",
  "| Payload Size | Direct Discord | With Chunker | Overhead |",
  "|-------------|---------------|-------------|----------|",
  "| < 2000 chars | 45ms | 47ms | +2ms |",
  "| 5000 chars | \u274C Error 400 | 142ms (3 chunks) | N/A |",
  "| 10000 chars | \u274C Error 400 | 285ms (6 chunks) | N/A |",
  "| 50000 chars | \u274C Error 400 | 1.2s (26 chunks) | N/A |",
  "",
  "Thank you for using discord-chunker! Report issues at https://github.com/wei/discord-chunker/issues",
].join("\n");

// Discord webhook bot avatar SVG (simple bot icon)
const BOT_AVATAR_SVG =
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="white" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>';

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
  count.textContent =
    chunks.length === 1
      ? "1 message \u2014 no chunking needed"
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
      const span = document.createElement("span");
      span.textContent = `Chunk ${i + 1} of ${chunks.length}`;
      divider.appendChild(span);
      group.appendChild(divider);
    }

    const msg = document.createElement("div");
    msg.className = i === 0 ? "dc-message" : "dc-message dc-message-continuation";

    if (i === 0) {
      const avatar = document.createElement("div");
      avatar.className = "dc-message-avatar";
      avatar.innerHTML = BOT_AVATAR_SVG;

      const content = document.createElement("div");
      content.className = "dc-message-content";

      const header = document.createElement("div");
      header.className = "dc-message-header";

      const username = document.createElement("span");
      username.className = "dc-message-username";
      username.textContent = "Webhook Bot";

      const tag = document.createElement("span");
      tag.className = "dc-message-tag";
      tag.textContent = "BOT";

      const timestamp = document.createElement("span");
      timestamp.className = "dc-message-timestamp";
      timestamp.textContent = ts;

      const badge = document.createElement("span");
      badge.className = "dc-message-chunk-badge";
      badge.textContent = `${chunks[i].length} chars`;

      header.append(username, tag, timestamp, badge);

      const body = document.createElement("div");
      body.className = "dc-message-body";
      body.textContent = chunks[i];

      content.append(header, body);
      msg.append(avatar, content);
    } else {
      const content = document.createElement("div");
      content.className = "dc-message-content";

      const body = document.createElement("div");
      body.className = "dc-message-body";
      body.textContent = chunks[i];

      content.appendChild(body);
      msg.appendChild(content);
    }

    group.appendChild(msg);
  }

  container.appendChild(group);
}

let statusTimeoutId: ReturnType<typeof setTimeout> | undefined;

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
  clearTimeout(statusTimeoutId);
  statusTimeoutId = setTimeout(() => {
    el.classList.remove("visible");
  }, 3000);
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
        &nbsp;&middot;&nbsp;
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
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
  sendBtn?.addEventListener("click", async () => {
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

    const parts = extractWebhookParts(webhookUrl);
    if (!parts) {
      showStatus("Invalid webhook URL", true);
      return;
    }
    const { id, token, search } = parts;

    sendBtn.disabled = true;
    try {
      const resp = await fetch(`/api/webhook/${id}/${token}${search}`, {
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
    } finally {
      sendBtn.disabled = false;
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
