import { chunkContent } from "./chunker";
import { parseConfig, validateConfig } from "./config";
import { buildDiscordUrl, sendChunks, validateContentType } from "./discord";
import { logError, logInfo } from "./logger";
import type { DiscordWebhookPayload } from "./types";
import { MAX_INPUT_BYTES, USER_AGENT } from "./types";

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sanitizeLogPath(pathname: string): string {
  return pathname.replace(/^\/api\/webhooks\/\d+\/[^/]+/, "/api/webhooks/:id/:token");
}

export default {
  async fetch(request: Request): Promise<Response> {
    const startMs = Date.now();
    const url = new URL(request.url);
    const requestId =
      request.headers.get("X-Request-Id") || request.headers.get("CF-Ray") || crypto.randomUUID();

    const wideEvent: Record<string, unknown> = {
      request_id: requestId,
      method: request.method,
      path: sanitizeLogPath(url.pathname),
      request_user_agent: request.headers.get("User-Agent") || "unknown",
      cf_ray: request.headers.get("CF-Ray") || undefined,
      cf_colo: (request as unknown as { cf?: { colo?: string } }).cf?.colo,
      query_present: url.search.length > 0,
    };

    let response: Response;
    try {
      response = await this.handleRequest(request, url, wideEvent);
    } catch (err: unknown) {
      wideEvent.error_type = err instanceof Error ? err.name : "unknown";
      wideEvent.error_message = err instanceof Error ? err.message : String(err);
      response = jsonError("Internal server error", 500);
    }

    const durationMs = Date.now() - startMs;
    wideEvent.duration_ms = durationMs;
    wideEvent.status_code = response.status;
    wideEvent.outcome = response.status < 400 ? "success" : "error";

    if (response.status >= 400) {
      logError(wideEvent);
    } else {
      logInfo(wideEvent);
    }

    // Ensure X-Request-Id and X-Service are in the final response
    const headers = new Headers(response.headers);
    headers.set("X-Request-Id", requestId);
    headers.set("X-Service", USER_AGENT);

    // Handle null body status codes
    if ([101, 204, 205, 304].includes(response.status)) {
      headers.delete("Content-Type");
      headers.delete("Content-Length");
      headers.delete("Transfer-Encoding");
      response = new Response(null, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } else {
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return response;
  },

  async handleRequest(
    request: Request,
    url: URL,
    wideEvent: Record<string, unknown>,
  ): Promise<Response> {
    if (url.pathname === "/" && request.method === "GET") {
      wideEvent.route_kind = "redirect";
      return Response.redirect(`${url.origin}/chunker`, 301);
    }

    if (url.pathname === "/health" && request.method === "GET") {
      wideEvent.route_kind = "health";
      const [serviceName = "unknown", serviceVersion = "unknown"] = USER_AGENT.split("/");
      return new Response(
        JSON.stringify({
          status: "ok",
          service: serviceName,
          version: serviceVersion,
          service_user_agent: USER_AGENT,
          request_user_agent: request.headers.get("User-Agent") || "unknown",
          timestamp: new Date().toISOString(),
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    if (request.method !== "POST") {
      wideEvent.route_kind = "method_not_allowed";
      return new Response("Method not allowed", { status: 405 });
    }

    // Route: /api/webhooks/{id}/{token}
    const match = url.pathname.match(/^\/api\/webhooks\/(\d+)\/([^/]+)$/);
    if (!match) {
      wideEvent.route_kind = "invalid_path";
      return jsonError("Invalid path. Use: /api/webhooks/{id}/{token}", 404);
    }

    const [, webhookId, webhookToken] = match;
    wideEvent.webhook_id = webhookId;

    // Validate Content-Type
    const ct = request.headers.get("Content-Type") || "";
    const contentType = validateContentType(ct);
    if (!contentType) {
      wideEvent.route_kind = "unsupported_content_type";
      return jsonError(
        "Unsupported Content-Type. Use application/json or multipart/form-data",
        415,
      );
    }

    // Multipart passthrough (file uploads)
    if (contentType === "multipart") {
      wideEvent.route_kind = "multipart_passthrough";
      const contentLength = request.headers.get("Content-Length");
      if (contentLength) {
        const parsed = Number.parseInt(contentLength, 10);
        if (Number.isFinite(parsed)) {
          wideEvent.input_bytes = parsed;
        }
      }
      const threadId = url.searchParams.get("thread_id") || undefined;
      wideEvent.thread_id_present = !!threadId;
      const wait = url.searchParams.has("wait")
        ? url.searchParams.get("wait") === "true"
        : undefined;
      wideEvent.wait = wait;
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

    // JSON processing
    const body = await request.text();
    const bodyBytes = new TextEncoder().encode(body).byteLength;
    wideEvent.input_bytes = bodyBytes;

    if (bodyBytes > MAX_INPUT_BYTES) {
      wideEvent.route_kind = "payload_too_large";
      return jsonError("Payload exceeds 100KB limit", 413);
    }

    // Parse config from query params
    const config = parseConfig(url.searchParams);
    const validationError = validateConfig(config);
    if (validationError) {
      wideEvent.route_kind = "invalid_config";
      return jsonError(validationError, 400);
    }

    // Parse JSON payload
    let payload: DiscordWebhookPayload;
    try {
      payload = JSON.parse(body) as DiscordWebhookPayload;
    } catch {
      wideEvent.route_kind = "invalid_json";
      return jsonError("Invalid JSON body", 400);
    }

    // Extract query params for Discord
    const threadId = url.searchParams.get("thread_id") || undefined;
    wideEvent.thread_id_present = !!threadId;
    const wait = url.searchParams.has("wait") ? url.searchParams.get("wait") === "true" : undefined;
    wideEvent.wait = wait;

    // Determine if chunking is needed
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const content = payload.content;
    const hasContent = typeof content === "string" && content.length > 0;
    wideEvent.has_embeds = hasEmbeds;
    wideEvent.has_content = hasContent;

    if (!hasContent || hasEmbeds) {
      wideEvent.route_kind = "json_passthrough";
      const discordUrl = buildDiscordUrl(webhookId, webhookToken, threadId, wait);
      const resp = await fetch(discordUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
        body: JSON.stringify(payload),
      });
      wideEvent.discord_last_status = resp.status;
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

    wideEvent.route_kind = "chunked";
    // Chunk the content
    let chunks: string[];
    try {
      chunks = chunkContent(content as string, config);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chunking failed";
      return jsonError(msg, 422);
    }

    wideEvent.chunk_count = chunks.length;

    // Build payload array
    const chunkPayloads: DiscordWebhookPayload[] = chunks.map((text, i) => {
      if (i === 0) return { ...payload, content: text };
      const sub: DiscordWebhookPayload = { content: text };
      if (payload.username) sub.username = payload.username;
      if (payload.avatar_url) sub.avatar_url = payload.avatar_url;
      return sub;
    });

    // Send chunks
    const result = await sendChunks(chunkPayloads, webhookId, webhookToken, threadId, wait);

    wideEvent.chunks_sent = result.chunksSent;
    wideEvent.retry_count = result.retryCount;
    wideEvent.discord_last_status = result.lastStatus;

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

    if (wait && result.firstMessageObject) {
      return new Response(JSON.stringify(result.firstMessageObject), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204 });
  },
};
