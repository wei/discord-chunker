import type { ChunkerConfig } from "./types";
import { DISCORD_CHAR_LIMIT } from "./types";

// ---- Fence parsing (from OpenClaw src/markdown/fences.ts) ----

interface FenceSpan {
  start: number;
  end: number;
  openLine: string;
  marker: string;
  indent: string;
}

function parseFenceSpans(buffer: string): FenceSpan[] {
  const spans: FenceSpan[] = [];
  let open:
    | {
        start: number;
        markerChar: string;
        markerLen: number;
        openLine: string;
        marker: string;
        indent: string;
      }
    | undefined;

  let offset = 0;
  while (offset <= buffer.length) {
    const nextNewline = buffer.indexOf("\n", offset);
    const lineEnd = nextNewline === -1 ? buffer.length : nextNewline;
    const line = buffer.slice(offset, lineEnd);

    const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (match) {
      const indent = match[1];
      const marker = match[2];
      const markerChar = marker[0];
      const markerLen = marker.length;
      if (!open) {
        open = { start: offset, markerChar, markerLen, openLine: line, marker, indent };
      } else if (open.markerChar === markerChar && markerLen >= open.markerLen) {
        spans.push({
          start: open.start,
          end: lineEnd,
          openLine: open.openLine,
          marker: open.marker,
          indent: open.indent,
        });
        open = undefined;
      }
    }

    if (nextNewline === -1) break;
    offset = nextNewline + 1;
  }

  // Unclosed fence — extends to end of buffer
  if (open) {
    spans.push({
      start: open.start,
      end: buffer.length,
      openLine: open.openLine,
      marker: open.marker,
      indent: open.indent,
    });
  }

  return spans;
}

function findFenceSpanAt(spans: FenceSpan[], index: number): FenceSpan | undefined {
  return spans.find((span) => index > span.start && index < span.end);
}

function isSafeFenceBreak(spans: FenceSpan[], index: number): boolean {
  return !findFenceSpanAt(spans, index);
}

// ---- Break point scanning (from OpenClaw src/auto-reply/chunk.ts) ----

function scanParenAwareBreakpoints(window: string): {
  lastNewline: number;
  lastWhitespace: number;
} {
  let lastNewline = -1;
  let lastWhitespace = -1;
  let parenDepth = 0;

  for (let i = 0; i < window.length; i++) {
    const ch = window[i];
    if (ch === "(") {
      parenDepth++;
    } else if (ch === ")") {
      if (parenDepth > 0) parenDepth--;
    } else if (parenDepth === 0) {
      if (ch === "\n") {
        lastNewline = i;
        lastWhitespace = i;
      } else if (ch === " " || ch === "\t") {
        lastWhitespace = i;
      }
    }
  }

  return { lastNewline, lastWhitespace };
}

// ---- Markdown-aware chunker ----

function pickSafeBreakIndex(
  window: string,
  spans: FenceSpan[],
): number {
  const { lastNewline, lastWhitespace } = scanParenAwareBreakpoints(window);

  // Prefer newline if it's a safe fence break
  if (lastNewline > 0 && isSafeFenceBreak(spans, lastNewline)) {
    return lastNewline;
  }
  // Fall back to whitespace if safe
  if (lastWhitespace > 0 && isSafeFenceBreak(spans, lastWhitespace)) {
    return lastWhitespace;
  }
  // Try newline even if inside fence (fence splitting will handle it)
  if (lastNewline > 0) return lastNewline;
  if (lastWhitespace > 0) return lastWhitespace;
  return -1;
}

function stripLeadingNewlines(value: string): string {
  let i = 0;
  while (i < value.length && value[i] === "\n") i++;
  return i > 0 ? value.slice(i) : value;
}

function chunkMarkdownText(text: string, limit: number): string[] {
  if (!text) return [];
  if (limit <= 0) return [text];
  if (text.length <= limit) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > limit) {
    const spans = parseFenceSpans(remaining);
    const window = remaining.slice(0, limit);

    const softBreak = pickSafeBreakIndex(window, spans);
    let breakIdx = softBreak > 0 ? softBreak : limit;

    const initialFence = isSafeFenceBreak(spans, breakIdx)
      ? undefined
      : findFenceSpanAt(spans, breakIdx);

    let fenceToSplit = initialFence;
    if (initialFence) {
      const closeLine = `${initialFence.indent}${initialFence.marker}`;
      const maxIdxIfNeedNewline = limit - (closeLine.length + 1);

      if (maxIdxIfNeedNewline <= 0) {
        fenceToSplit = undefined;
        breakIdx = limit;
      } else {
        const minProgressIdx = Math.min(
          remaining.length,
          initialFence.start + initialFence.openLine.length + 2,
        );
        const maxIdxIfAlreadyNewline = limit - closeLine.length;

        let pickedNewline = false;
        let lastNl = remaining.lastIndexOf(
          "\n",
          Math.max(0, maxIdxIfAlreadyNewline - 1),
        );
        while (lastNl !== -1) {
          const candidateBreak = lastNl + 1;
          if (candidateBreak < minProgressIdx) break;
          const candidateFence = findFenceSpanAt(spans, candidateBreak);
          if (candidateFence && candidateFence.start === initialFence.start) {
            breakIdx = Math.max(1, candidateBreak);
            pickedNewline = true;
            break;
          }
          lastNl = remaining.lastIndexOf("\n", lastNl - 1);
        }

        if (!pickedNewline) {
          if (minProgressIdx > maxIdxIfAlreadyNewline) {
            fenceToSplit = undefined;
            breakIdx = limit;
          } else {
            breakIdx = Math.max(minProgressIdx, maxIdxIfNeedNewline);
          }
        }
      }

      const fenceAtBreak = findFenceSpanAt(spans, breakIdx);
      fenceToSplit =
        fenceAtBreak && fenceAtBreak.start === initialFence.start
          ? fenceAtBreak
          : undefined;
    }

    let rawChunk = remaining.slice(0, breakIdx);
    if (!rawChunk) break;

    const brokeOnSeparator =
      breakIdx < remaining.length && /\s/.test(remaining[breakIdx]);
    const nextStart = Math.min(
      remaining.length,
      breakIdx + (brokeOnSeparator ? 1 : 0),
    );
    let next = remaining.slice(nextStart);

    if (fenceToSplit) {
      const closeLine = `${fenceToSplit.indent}${fenceToSplit.marker}`;
      rawChunk = rawChunk.endsWith("\n")
        ? `${rawChunk}${closeLine}`
        : `${rawChunk}\n${closeLine}`;
      next = `${fenceToSplit.openLine}\n${next}`;
    } else {
      // Trim trailing whitespace when not splitting fence
      rawChunk = rawChunk.trimEnd();
      next = stripLeadingNewlines(next);
    }

    chunks.push(rawChunk);
    remaining = next;
  }

  if (remaining.length) chunks.push(remaining);
  return chunks;
}

// ---- Line limit re-splitting ----

const FENCE_REGEX = /^( {0,3})(`{3,}|~{3,})(.*)$/;

function applyLineLimit(
  chunks: string[],
  maxLines: number,
  maxChars: number,
): string[] {
  if (maxLines <= 0) return chunks;

  const result: string[] = [];
  for (const chunk of chunks) {
    const lines = chunk.split("\n");
    if (lines.length <= maxLines) {
      result.push(chunk);
      continue;
    }

    // Re-split at line boundaries — fence-aware single pass
    let current: string[] = [];
    let insideFence = false;
    let fenceOpenLine = "";
    let fenceMarkerChar = "";
    let fenceMarkerLen = 0;

    for (const line of lines) {
      // Check if we need to split BEFORE adding this line
      if (current.length >= maxLines && current.length > 0) {
        if (insideFence) {
          // Close the fence in the current chunk before splitting
          const closeMarker = fenceMarkerChar.repeat(fenceMarkerLen);
          current.push(closeMarker);
          result.push(current.join("\n"));
          // Reopen the fence in the next chunk
          current = [fenceOpenLine];
        } else {
          result.push(current.join("\n"));
          current = [];
        }
      }

      current.push(line);

      // Track fence state AFTER adding the line
      const fenceMatch = line.match(FENCE_REGEX);
      if (fenceMatch) {
        const marker = fenceMatch[2];
        const mChar = marker[0];
        const mLen = marker.length;

        if (!insideFence) {
          insideFence = true;
          fenceOpenLine = line;
          fenceMarkerChar = mChar;
          fenceMarkerLen = mLen;
        } else if (mChar === fenceMarkerChar && mLen >= fenceMarkerLen) {
          insideFence = false;
        }
      }
    }

    if (current.length > 0) {
      result.push(current.join("\n"));
    }
  }
  return result;
}

// ---- Public API ----

/**
 * Chunk content for Discord delivery.
 * Returns array of content strings, each safe to send as a Discord message.
 * Throws if any resulting chunk exceeds DISCORD_CHAR_LIMIT characters.
 */
export function chunkContent(
  content: string,
  config: ChunkerConfig,
): string[] {
  if (!content) return [content];

  const lineCount = content.split("\n").length;
  const needsCharSplit = content.length > config.maxChars;
  const needsLineSplit = config.maxLines > 0 && lineCount > config.maxLines;

  if (!needsCharSplit && !needsLineSplit) {
    return [content];
  }

  // Step 1: Character-based markdown-aware splitting
  let chunks = chunkMarkdownText(content, config.maxChars);

  // Step 2: Apply line limit (single re-split pass)
  if (config.maxLines > 0) {
    chunks = applyLineLimit(chunks, config.maxLines, config.maxChars);
  }

  // Step 3: Sanity check — no chunk may exceed Discord's hard limit
  for (const chunk of chunks) {
    if (chunk.length > DISCORD_CHAR_LIMIT) {
      throw new Error(
        `Unable to chunk: resulting chunk exceeds ${DISCORD_CHAR_LIMIT} character limit (got ${chunk.length}). ` +
        `This can happen when a single token or line exceeds max_chars with no valid break point.`
      );
    }
  }

  return chunks;
}
