// web/app.ts
import { createAnimation } from "./animation";
import {
  type ChunkerConfig,
  chunkContent,
  countLines,
  DEFAULT_MAX_LINES,
  parseConfig,
} from "./chunker";
import { generateCurl } from "./curl-generator";
import DEFAULT_EXAMPLE from "./example.md";
import { renderDiscordMarkdown } from "./markdown";
import { convertWebhookUrl, extractWebhookParts, isValidWebhookUrl } from "./url-converter";

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

function scrollChunkResultsIntoView(): void {
  const preview = document.getElementById("chunk-results");
  if (!preview) return;

  // Wait until the rendered layout settles so the scroll target is stable.
  requestAnimationFrame(() => {
    preview.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function renderChunks(chunks: string[]): void {
  const container = document.getElementById("chunk-results");
  if (!container) return;
  container.innerHTML = "";

  const count = document.createElement("div");
  count.className = "chunk-count";
  if (chunks.length === 1) {
    count.textContent = "1 message \u2014 no chunking needed";
  } else {
    count.textContent = `${chunks.length} messages will be sent`;
    const note = document.createElement("div");
    note.className = "chunk-count-note";
    note.textContent = `Some chunks may be under 2000 characters due to the ${DEFAULT_MAX_LINES}-line readability limit.`;
    count.appendChild(note);
  }
  container.appendChild(count);

  const group = document.createElement("div");
  group.className = "dc-message-group";

  const ts = formatTimestamp();

  for (let i = 0; i < chunks.length; i++) {
    const msg = document.createElement("div");
    msg.className = i === 0 ? "dc-message" : "dc-message dc-message-continuation";

    const pill = document.createElement("div");
    pill.className = "dc-chunk-pill";

    const label = document.createElement("span");
    label.className = "dc-chunk-pill-label";
    label.textContent = `Chunk ${i + 1}`;

    const stats = document.createElement("span");
    stats.className = "dc-chunk-pill-stats";
    stats.textContent = `${chunks[i].length} characters \u2022 ${countLines(chunks[i])} lines`;

    pill.append(label, stats);
    msg.appendChild(pill);

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

      header.append(username, tag, timestamp);

      const body = document.createElement("div");
      body.className = "dc-message-body dc-markdown";
      body.innerHTML = renderDiscordMarkdown(chunks[i]);

      content.append(header, body);
      msg.append(avatar, content);
    } else {
      const content = document.createElement("div");
      content.className = "dc-message-content";

      const body = document.createElement("div");
      body.className = "dc-message-body dc-markdown";
      body.innerHTML = renderDiscordMarkdown(chunks[i]);

      content.appendChild(body);
      msg.appendChild(content);
    }

    group.appendChild(msg);
  }

  container.appendChild(group);
}

let statusTimeoutId: ReturnType<typeof setTimeout> | undefined;

function preprocessContent(content: string): string {
  // Preserve markdown code blocks during processing
  const codeBlocks: string[] = [];

  // Replace fenced code blocks (``` ... ```)
  let processed = content.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Replace inline code (` ... `)
  processed = processed.replace(/`[^`]*`/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });

  // Replace 3+ consecutive newlines with 2 newlines, then trim
  processed = processed.replace(/\n{3,}/g, "\n\n").trim();

  // Restore code blocks
  processed = processed.replace(/__CODE_BLOCK_(\d+)__/g, (_match, index) => {
    return codeBlocks[parseInt(index, 10)];
  });

  return processed;
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
          <img src="/favicon.png" width="40" height="40" alt="discord-chunker logo" />
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
          <button class="dc-btn dc-btn-secondary" id="copy-url-btn" type="button" aria-label="Copy proxy URL to clipboard">Copy</button>
        </div>
      </div>

      <div class="section" id="playground">
        <div class="section-title">Try It Out</div>
        <textarea class="dc-textarea" id="content-input" rows="12"></textarea>
        <div class="actions">
          <button class="dc-btn dc-btn-brand" id="dry-run-btn" type="button" aria-label="Preview chunked messages without sending">Dry Run</button>
          <button class="dc-btn dc-btn-green" id="send-btn" type="button" aria-label="Send message to Discord webhook">Send</button>
          <button class="dc-btn dc-btn-outline" id="copy-curl-btn" type="button" aria-label="Copy curl command to clipboard">Copy curl</button>
        </div>
        <div id="chunk-results"></div>
      </div>

      <footer class="footer">
        Made with \u2764\uFE0F by <a href="https://github.com/wei" target="_blank" rel="noopener">Wei</a>
        &nbsp;&middot;&nbsp;
        <a href="https://github.com/wei/discord-chunker" target="_blank" rel="noopener">GitHub</a>
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
    let content = contentInput.value;
    if (!content.trim()) {
      showStatus("Enter some content first", true);
      return;
    }
    try {
      content = preprocessContent(content);
      const config = getDefaultConfig();
      const chunks = chunkContent(content, config);
      renderChunks(chunks);
      scrollChunkResultsIntoView();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chunking failed";
      showStatus(msg, true);
    }
  });

  // Send
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
  sendBtn?.addEventListener("click", async () => {
    let content = contentInput.value;
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

    content = preprocessContent(content);
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
    let content = contentInput.value;
    const webhookUrl = webhookInput.value.trim();

    if (!content.trim()) {
      showStatus("Enter some content first", true);
      return;
    }

    content = preprocessContent(content);
    const proxyUrl = isValidWebhookUrl(webhookUrl)
      ? convertWebhookUrl(webhookUrl)
      : `${window.location.origin}/api/webhook/YOUR_ID/YOUR_TOKEN`;

    const curl = generateCurl(proxyUrl || "", content);
    copyToClipboard(curl, "curl command");
  });
}

document.addEventListener("DOMContentLoaded", init);
