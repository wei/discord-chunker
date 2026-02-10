import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";

describe("Frontend routes", () => {
  it("GET / redirects to /chunker", async () => {
    const req = new Request("https://discord.git.ci/");
    const ctx = createExecutionContext();
    const resp = await worker.fetch(req, env, ctx);
    await waitOnExecutionContext(ctx);
    expect(resp.status).toBe(301);
    expect(resp.headers.get("Location")).toContain("/chunker");
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
