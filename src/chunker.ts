import type { ChunkerConfig } from "./types";
import { DISCORD_CHAR_LIMIT } from "./types";

const FENCE_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

interface FenceState {
  openLine: string; // The full opening fence line (e.g. "```typescript")
  markerChar: string; // "`" or "~"
  markerLen: number; // 3+
}

function isFenceLine(line: string): boolean {
  return FENCE_RE.test(line);
}

/**
 * Count content lines in text — excludes code fence delimiter lines.
 */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").filter((line) => !isFenceLine(line)).length;
}

/**
 * Chunk content for Discord delivery.
 *
 * Single-pass line-oriented splitter:
 * - Walks lines forward, never splitting mid-line
 * - Fence delimiter lines are excluded from the line count
 * - When a split lands inside a code block, the fence is closed/reopened
 * - Hard-cuts only for single lines exceeding maxChars
 */
export function chunkContent(content: string, config: ChunkerConfig): string[] {
  if (!content) return [content];

  const { maxChars, maxLines } = config;
  const lines = content.split("\n");

  const chunks: string[] = [];
  let current: string[] = [];
  let currentChars = 0;
  let currentContentLines = 0; // excludes fence lines
  let fence: FenceState | null = null;

  const flush = () => {
    if (current.length === 0) return;
    // Close open fence before flushing
    if (fence) {
      const closeLine = fence.markerChar.repeat(fence.markerLen);
      current.push(closeLine);
      currentChars += 1 + closeLine.length; // \n + close
    }
    chunks.push(current.join("\n").trim());
    current = [];
    currentChars = 0;
    currentContentLines = 0;
    // Reopen fence in next chunk
    if (fence) {
      current = [fence.openLine];
      currentChars = fence.openLine.length;
      // Opening fence line doesn't count toward content lines
    }
  };

  for (const line of lines) {
    // Detect fence transitions
    const fenceMatch = line.match(FENCE_RE);
    let lineIsFence = false;
    if (fenceMatch) {
      const marker = fenceMatch[2];
      const mChar = marker[0];
      const mLen = marker.length;
      if (!fence) {
        // Opening fence
        lineIsFence = true;
        // We'll set fence state AFTER adding the line
      } else if (mChar === fence.markerChar && mLen >= fence.markerLen) {
        // Closing fence
        lineIsFence = true;
      }
    }

    // Hard-cut: single line exceeds maxChars
    if (line.length > maxChars) {
      flush();

      // If we are inside an active fence, preserve fence reopening at the
      // start of every hard-cut chunk and close on every flush.
      if (fence) {
        let remaining = line;
        while (remaining.length > 0) {
          const joinCost = current.length > 0 ? 1 : 0;
          const closeLine = fence.markerChar.repeat(fence.markerLen);
          const fenceCloseOverhead = 1 + closeLine.length; // \n + close
          const room = maxChars - currentChars - joinCost - fenceCloseOverhead;

          if (room <= 0) {
            throw new Error(
              `Unable to chunk: maxChars (${maxChars}) is too small to preserve active code fence wrappers.`,
            );
          }

          const take = Math.min(room, remaining.length);
          const piece = remaining.slice(0, take);
          current.push(piece);
          currentChars =
            current.length === 1 ? piece.length : currentChars + joinCost + piece.length;
          currentContentLines += lineIsFence ? 0 : 1;
          remaining = remaining.slice(take);

          if (remaining.length > 0) {
            flush();
          }
        }
      } else {
        let remaining = line;
        while (remaining.length > maxChars) {
          chunks.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        if (remaining.length > 0) {
          current = [remaining];
          currentChars = remaining.length;
          currentContentLines = lineIsFence ? 0 : 1;
        }
      }

      // Update fence state for this line
      if (fenceMatch) {
        const marker = fenceMatch[2];
        if (!fence) {
          fence = { openLine: line, markerChar: marker[0], markerLen: marker.length };
        } else if (marker[0] === fence.markerChar && marker.length >= fence.markerLen) {
          fence = null;
        }
      }
      continue;
    }

    // Cost of adding this line
    const joinCost = current.length > 0 ? 1 : 0;
    const nextChars = currentChars + joinCost + line.length;
    const nextContentLines = currentContentLines + (lineIsFence ? 0 : 1);

    // Check if adding this line would exceed either limit
    // When inside a fence, account for the close-fence overhead on flush
    const fenceCloseOverhead = fence ? 1 + fence.markerChar.repeat(fence.markerLen).length : 0;
    const exceedsChars = nextChars + (fence ? fenceCloseOverhead : 0) > maxChars;
    const exceedsLines = maxLines > 0 && nextContentLines > maxLines;

    if ((exceedsChars || exceedsLines) && current.length > 0) {
      flush();
      // Recalculate after flush (fence reopen may have added to current)
    }

    current.push(line);
    currentChars = current.length === 1 ? line.length : currentChars + 1 + line.length;
    currentContentLines += lineIsFence ? 0 : 1;

    // Update fence state AFTER adding the line
    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!fence) {
        fence = { openLine: line, markerChar: marker[0], markerLen: marker.length };
      } else if (marker[0] === fence.markerChar && marker.length >= fence.markerLen) {
        fence = null;
      }
    }
  }

  // Flush remaining (no fence close needed — content ends naturally)
  if (current.length > 0) {
    chunks.push(current.join("\n"));
  }

  // Sanity check
  for (const chunk of chunks) {
    if (chunk.length > DISCORD_CHAR_LIMIT) {
      throw new Error(
        `Unable to chunk: resulting chunk exceeds ${DISCORD_CHAR_LIMIT} character limit (got ${chunk.length}).`,
      );
    }
  }

  return chunks;
}
