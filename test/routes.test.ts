import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("Frontend routes", () => {
  it("GET / redirects to /chunker", async () => {
    const resp = await SELF.fetch("https://discord.git.ci/", { redirect: "manual" });
    expect(resp.status).toBe(301);
    expect(resp.headers.get("Location")).toContain("/chunker");
  });

  it("GET /chunker returns HTML", async () => {
    const resp = await SELF.fetch("https://discord.git.ci/chunker");
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toContain("text/html");
    const body = await resp.text();
    expect(body).toContain("<!DOCTYPE html>");
  });
});
