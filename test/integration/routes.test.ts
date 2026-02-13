import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Frontend routes", () => {
  it("GET / redirects to /chunker", async () => {
    const resp = await SELF.fetch("https://discord.git.ci/", { redirect: "manual" });
    expect(resp.status).toBe(301);
    expect(resp.headers.get("Location")).toContain("/chunker");
  });

  // GET /chunker and /favicon.png are served by Cloudflare static assets,
  // not the worker — no route test needed here.
});
