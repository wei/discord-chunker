import type {
  DiscordWebhookPayload,
  SendResult,
  RateLimitState,
} from "./types";
import { DEFAULT_RETRY_DELAY_MS, DEFAULT_RATE_LIMIT_DELAY_MS } from "./types";

export function validateContentType(ct: string): "json" | "multipart" | null {
  if (ct.startsWith("application/json")) return "json";
  if (ct.startsWith("multipart/form-data")) return "multipart";
  return null;
}

export function buildDiscordUrl(
  webhookId: string,
  webhookToken: string,
  threadId?: string,
  wait?: boolean,
): string {
  const params: string[] = [];
  if (wait === true) params.push("wait=true");
  if (wait === false) params.push("wait=false");
  if (threadId) params.push(`thread_id=${threadId}`);

  const base = `https://discord.com/api/webhooks/${webhookId}/${webhookToken}`;
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}

export function updateRateLimitState(response: Response): RateLimitState {
  const remaining = response.headers.get("X-RateLimit-Remaining");
  const resetAfter = response.headers.get("X-RateLimit-Reset-After");
  return {
    remaining: remaining !== null ? parseInt(remaining) : null,
    resetAfterMs: resetAfter !== null ? parseFloat(resetAfter) * 1000 : null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeJsonParse(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    // Discord returned non-JSON (e.g. HTML error page during outage)
    return null;
  }
}

export async function sendChunks(
  chunks: DiscordWebhookPayload[],
  webhookId: string,
  webhookToken: string,
  threadId?: string,
  wait?: boolean,
): Promise<SendResult> {
  let firstMessageObject: Record<string, unknown> | null = null;
  let rateLimit: RateLimitState = { remaining: null, resetAfterMs: null };

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isFirst = i === 0;
    const hasMoreChunks = i < chunks.length - 1;

    // Only first chunk uses wait=true (if caller requested it)
    const chunkWait = isFirst ? wait : undefined;
    const webhookUrl = buildDiscordUrl(webhookId, webhookToken, threadId, chunkWait);

    // Preemptive delay when exactly 1 request remains in rate limit window AND more chunks to send
    if (
      rateLimit.remaining !== null &&
      rateLimit.remaining === 1 &&
      hasMoreChunks
    ) {
      const delay = rateLimit.resetAfterMs ?? DEFAULT_RATE_LIMIT_DELAY_MS;
      await sleep(delay);
    }

    let response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });

    // Single retry for any error
    if (!response.ok) {
      const failedStatus = response.status;
      let delayMs = DEFAULT_RETRY_DELAY_MS;

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        delayMs = retryAfter ? parseFloat(retryAfter) * 1000 : DEFAULT_RETRY_DELAY_MS;
      }

      // Drain error response body before retrying
      await response.text();
      await sleep(delayMs);

      response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        const retryStatus = response.status;
        await response.text(); // Drain retry error body
        return {
          success: false,
          firstMessageObject,
          chunksSent: i,
          chunksTotal: chunks.length,
          lastError: `Discord API error: ${retryStatus} after retry (initial: ${failedStatus})`,
        };
      }
    }

    rateLimit = updateRateLimitState(response);

    // Capture first message object if wait=true; drain all other response bodies
    if (isFirst && wait) {
      firstMessageObject = await safeJsonParse(response);
    } else {
      await response.text(); // Drain response body to free connection
    }
  }

  return {
    success: true,
    firstMessageObject,
    chunksSent: chunks.length,
    chunksTotal: chunks.length,
    lastError: null,
  };
}
