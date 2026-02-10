import { parseConfig, validateConfig } from "./config";
import { chunkContent } from "./chunker";
import {
  buildDiscordUrl,
  sendChunks,
  validateContentType,
} from "./discord";
import type { DiscordWebhookPayload } from "./types";

const MAX_INPUT_BYTES = 102400; // 100KB

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function passthroughToDiscord(
  request: Request,
  webhookId: string,
  webhookToken: string,
  params: URLSearchParams,
): Promise<Response> {
  const threadId = params.get("thread_id") || undefined;
  const wait = params.has("wait") ? params.get("wait") === "true" : undefined;
  const url = buildDiscordUrl(webhookId, webhookToken, threadId, wait);

  return fetch(url, {
    method: "POST",
    headers: request.headers,
    body: request.body,
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // Route: /webhook/{id}/{token}
    const match = url.pathname.match(/^\/webhook\/(\d+)\/([^/]+)$/);
    if (!match) {
      return jsonError("Invalid path. Use: /webhook/{id}/{token}", 404);
    }

    const [, webhookId, webhookToken] = match;

    // Validate Content-Type
    const ct = request.headers.get("Content-Type") || "";
    const contentType = validateContentType(ct);
    if (!contentType) {
      return jsonError(
        "Unsupported Content-Type. Use application/json or multipart/form-data",
        415,
      );
    }

    // Multipart passthrough (file uploads)
    if (contentType === "multipart") {
      return passthroughToDiscord(
        request,
        webhookId,
        webhookToken,
        url.searchParams,
      );
    }

    // Read body and enforce size limit
    const body = await request.text();
    if (body.length > MAX_INPUT_BYTES) {
      return jsonError("Payload exceeds 100KB limit", 413);
    }

    // Parse config from query params
    const config = parseConfig(url.searchParams);
    const validationError = validateConfig(config);
    if (validationError) {
      return jsonError(validationError, 400);
    }

    // Parse JSON payload
    let payload: DiscordWebhookPayload;
    try {
      payload = JSON.parse(body) as DiscordWebhookPayload;
    } catch {
      return jsonError("Invalid JSON body", 400);
    }

    // Extract query params for Discord
    const threadId = url.searchParams.get("thread_id") || undefined;
    const wait = url.searchParams.has("wait")
      ? url.searchParams.get("wait") === "true"
      : true; // Default to wait=true

    // Determine if chunking is needed
    const hasEmbeds =
      Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const content = payload.content;
    const hasContent =
      typeof content === "string" && content.length > 0;

    if (!hasContent || hasEmbeds) {
      // Passthrough — send as-is
      const discordUrl = buildDiscordUrl(
        webhookId,
        webhookToken,
        threadId,
        wait,
      );
      const resp = await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (wait) {
        const respBody = await resp.text();
        return new Response(respBody, {
          status: resp.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      await resp.text(); // Drain
      return new Response(null, { status: 204 });
    }

    // Chunk the content
    let chunks: string[];
    try {
      chunks = chunkContent(content!, config);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Chunking failed";
      return jsonError(msg, 422);
    }

    // Build payload array — first chunk keeps all metadata, rest are content-only
    const chunkPayloads: DiscordWebhookPayload[] = chunks.map(
      (text, i) => {
        if (i === 0) {
          return { ...payload, content: text };
        }
        // Subsequent chunks: content only + preserve username/avatar
        const sub: DiscordWebhookPayload = { content: text };
        if (payload.username) sub.username = payload.username;
        if (payload.avatar_url) sub.avatar_url = payload.avatar_url;
        return sub;
      },
    );

    // Send chunks to Discord
    const result = await sendChunks(
      chunkPayloads,
      webhookId,
      webhookToken,
      threadId,
      wait,
    );

    if (!result.success) {
      const errorBody: Record<string, unknown> = {
        error: "Failed to send all chunks to Discord",
        chunks_sent: result.chunksSent,
        chunks_total: result.chunksTotal,
      };
      if (result.firstMessageObject?.id) {
        errorBody.first_message_id = result.firstMessageObject.id;
      }
      return new Response(JSON.stringify(errorBody), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Return Discord's response format
    if (wait && result.firstMessageObject) {
      return new Response(JSON.stringify(result.firstMessageObject), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204 });
  },
};
