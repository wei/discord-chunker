// web/curl-generator.ts
export function generateCurl(proxyUrl: string, content: string): string {
  const escaped = content.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
  return [
    `curl -X POST '${proxyUrl}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '{"content": "${escaped}"}'`,
  ].join(" \\\n");
}
