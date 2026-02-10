import { chunkContent } from "./chunker";
import { parseConfig, validateConfig } from "./config";
import { buildDiscordUrl, sendChunks, validateContentType } from "./discord";
import type { DiscordWebhookPayload } from "./types";
import { MAX_INPUT_BYTES, USER_AGENT } from "./types";

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await this.handleRequest(request);

    // If it's a null body status, we MUST pass null as body to the constructor
    const isNullBodyStatus = [101, 204, 205, 304].includes(response.status);

    const headers = new Headers(response.headers);
    headers.set("X-Service", USER_AGENT);

    if (isNullBodyStatus) {
      // Re-constructing with null body and no body-related headers is required for these status codes
      headers.delete("Content-Type");
      headers.delete("Content-Length");
      headers.delete("Transfer-Encoding");

      // In some environments, the constructor might still complain if we pass ANY init object
      // that could imply a body. Let's be extremely minimal.
      return new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },

  async handleRequest(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);

    // Route: /api/webhook/{id}/{token}
    const match = url.pathname.match(/^\/api\/webhook\/(\d+)\/([^/]+)$/);
    if (!match) {
      return jsonError("Invalid path. Use: /api/webhook/{id}/{token}", 404);
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
      const threadId = url.searchParams.get("thread_id") || undefined;
      const wait = url.searchParams.has("wait")
        ? url.searchParams.get("wait") === "true"
        : undefined;
      const discordUrl = buildDiscordUrl(webhookId, webhookToken, threadId, wait);

      // Clone request to avoid consuming the body stream
      const headers = new Headers(request.headers);
      headers.set("User-Agent", USER_AGENT);
      return fetch(discordUrl, {
        method: "POST",
        headers,
        body: request.clone().body,
      });
    }

    // Read body and enforce size limit (use byte length for accurate UTF-8 measurement)
    const body = await request.text();
    const bodyBytes = new TextEncoder().encode(body).byteLength;
    if (bodyBytes > MAX_INPUT_BYTES) {
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
    // wait defaults to undefined (omitted) per design doc — only set when explicitly passed
    const threadId = url.searchParams.get("thread_id") || undefined;
    const wait = url.searchParams.has("wait") ? url.searchParams.get("wait") === "true" : undefined;

    // Determine if chunking is needed
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const content = payload.content;
    const hasContent = typeof content === "string" && content.length > 0;

    if (!hasContent || hasEmbeds) {
      // Passthrough — send as-is
      const discordUrl = buildDiscordUrl(webhookId, webhookToken, threadId, wait);
      const resp = await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
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
      chunks = chunkContent(content as string, config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chunking failed";
      return jsonError(msg, 422);
    }

    // Build payload array — first chunk keeps all metadata, rest are content-only
    const chunkPayloads: DiscordWebhookPayload[] = chunks.map((text, i) => {
      if (i === 0) {
        return { ...payload, content: text };
      }
      // Subsequent chunks: content only + preserve username/avatar
      const sub: DiscordWebhookPayload = { content: text };
      if (payload.username) sub.username = payload.username;
      if (payload.avatar_url) sub.avatar_url = payload.avatar_url;
      return sub;
    });

    // Send chunks to Discord
    const result = await sendChunks(chunkPayloads, webhookId, webhookToken, threadId, wait);

    if (!result.success) {
      const errorBody: Record<string, unknown> = {
        error: result.lastError ?? "Failed to send all chunks to Discord",
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
