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
    const startMs = Date.now();
    const url = new URL(request.url);
    const requestId = request.headers.get("X-Request-Id") || crypto.randomUUID();
    const wideEvent: Record<string, unknown> = {
      request_id: requestId,
      method: request.method,
      path: url.pathname,
      request_user_agent: request.headers.get("User-Agent") || "unknown",
    };

    let response: Response | null = null;

    try {
      if (url.pathname === "/" && request.method === "GET") {
        wideEvent.route_kind = "redirect";
        response = Response.redirect(`${url.origin}/chunker`, 301);
      } else if (url.pathname === "/health" && request.method === "GET") {
        wideEvent.route_kind = "health";
        const [serviceName = "unknown", serviceVersion = "unknown"] = USER_AGENT.split("/");
        response = new Response(
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
      } else if (request.method !== "POST") {
        wideEvent.route_kind = "invalid_method";
        response = new Response("Method not allowed", { status: 405 });
      } else {
        // Route: /api/webhooks/{id}/{token}
        const match = url.pathname.match(/^\/api\/webhooks\/(\d+)\/([^/]+)$/);
        if (!match) {
          wideEvent.route_kind = "invalid_path";
          response = jsonError("Invalid path. Use: /api/webhooks/{id}/{token}", 404);
        } else {
          const [, webhookId, webhookToken] = match;
          wideEvent.webhook_id = webhookId;

          // Validate Content-Type
          const ct = request.headers.get("Content-Type") || "";
          const contentType = validateContentType(ct);
          if (!contentType) {
            wideEvent.route_kind = "unsupported_content_type";
            response = jsonError(
              "Unsupported Content-Type. Use application/json or multipart/form-data",
              415,
            );
          } else if (contentType === "multipart") {
            wideEvent.route_kind = "multipart_passthrough";
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
            response = await fetch(discordUrl, {
              method: "POST",
              headers,
              body: request.clone().body,
            });
          } else {
            // JSON processing
            const body = await request.text();
            const bodyBytes = new TextEncoder().encode(body).byteLength;
            wideEvent.input_bytes = bodyBytes;

            if (bodyBytes > MAX_INPUT_BYTES) {
              wideEvent.route_kind = "payload_too_large";
              response = jsonError("Payload exceeds 100KB limit", 413);
            } else {
              // Parse config from query params
              const config = parseConfig(url.searchParams);
              const validationError = validateConfig(config);
              if (validationError) {
                wideEvent.route_kind = "invalid_config";
                response = jsonError(validationError, 400);
              } else {
                // Parse JSON payload
                let payload: DiscordWebhookPayload;
                try {
                  payload = JSON.parse(body) as DiscordWebhookPayload;
                } catch {
                  wideEvent.route_kind = "invalid_json";
                  response = jsonError("Invalid JSON body", 400);
                  throw new Error("skip_logging"); // Skip to finally
                }

                // Extract query params for Discord
                const threadId = url.searchParams.get("thread_id") || undefined;
                wideEvent.thread_id_present = !!threadId;
                const wait = url.searchParams.has("wait")
                  ? url.searchParams.get("wait") === "true"
                  : undefined;
                wideEvent.wait = wait;

                // Determine if chunking is needed
                const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
                const content = payload.content;
                const hasContent = typeof content === "string" && content.length > 0;
                wideEvent.has_embeds = hasEmbeds;
                wideEvent.has_content = hasContent;

                if (!hasContent || hasEmbeds) {
                  wideEvent.route_kind = "json_passthrough";
                  // Passthrough — send as-is
                  const discordUrl = buildDiscordUrl(webhookId, webhookToken, threadId, wait);
                  const resp = await fetch(discordUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "User-Agent": USER_AGENT },
                    body: JSON.stringify(payload),
                  });
                  if (wait) {
                    const respBody = await resp.text();
                    response = new Response(respBody, {
                      status: resp.status,
                      headers: { "Content-Type": "application/json" },
                    });
                  } else {
                    await resp.text(); // Drain
                    response = new Response(null, { status: 204 });
                  }
                } else {
                  wideEvent.route_kind = "chunked";
                  // Chunk the content
                  let chunks: string[];
                  try {
                    chunks = chunkContent(content as string, config);
                  } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : "Chunking failed";
                    response = jsonError(msg, 422);
                    throw new Error("skip_logging");
                  }

                  wideEvent.chunk_count = chunks.length;

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
                  const result = await sendChunks(
                    chunkPayloads,
                    webhookId,
                    webhookToken,
                    threadId,
                    wait,
                  );

                  wideEvent.chunks_sent = result.chunksSent;
                  wideEvent.retry_count = result.retryCount;

                  if (!result.success) {
                    const errorBody: Record<string, unknown> = {
                      error: result.lastError ?? "Failed to send all chunks to Discord",
                      chunks_sent: result.chunksSent,
                      chunks_total: result.chunksTotal,
                    };
                    if (result.firstMessageObject?.id) {
                      errorBody.first_message_id = result.firstMessageObject.id;
                    }
                    response = new Response(JSON.stringify(errorBody), {
                      status: 502,
                      headers: { "Content-Type": "application/json" },
                    });
                  } else {
                    // Return Discord's response format
                    if (wait && result.firstMessageObject) {
                      response = new Response(JSON.stringify(result.firstMessageObject), {
                        status: 200,
                        headers: { "Content-Type": "application/json" },
                      });
                    } else {
                      response = new Response(null, { status: 204 });
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "skip_logging") {
        // Response already set, just continue to finally
      } else {
        // Unexpected error
        wideEvent.error_type = err instanceof Error ? err.name : "unknown";
        wideEvent.error_message = err instanceof Error ? err.message : String(err);
        response = jsonError("Internal server error", 500);
      }
    } finally {
      // Add request ID and timing to response headers
      if (!response) {
        response = jsonError("Internal server error", 500);
      }

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const finalHeaders = new Headers(response!.headers);
      finalHeaders.set("X-Request-Id", requestId);

      const durationMs = Date.now() - startMs;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      wideEvent.status_code = response!.status;
      wideEvent.duration_ms = durationMs;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      wideEvent.outcome = response!.status < 400 ? "success" : "error";

      // Emit structured wide event
      if (wideEvent.outcome === "error") {
        logError(wideEvent);
      } else {
        logInfo(wideEvent);
      }

      // Return response with request ID header
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if ([101, 204, 205, 304].includes(response!.status)) {
        finalHeaders.delete("Content-Type");
        finalHeaders.delete("Content-Length");
        finalHeaders.delete("Transfer-Encoding");
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        response = new Response(null, {
          status: response!.status,
          statusText: response!.statusText,
          headers: finalHeaders,
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        response = new Response(response!.body, {
          status: response!.status,
          statusText: response!.statusText,
          headers: finalHeaders,
        });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return response!;
  },
};
