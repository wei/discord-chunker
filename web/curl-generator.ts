// web/curl-generator.ts
export function generateCurl(proxyUrl: string, content: string): string {
  const json = JSON.stringify({ content });
  const shellSafe = json.replace(/'/g, "'\\''");
  return [
    `curl -X POST '${proxyUrl}'`,
    `  -H 'Content-Type: application/json'`,
    `  -d '${shellSafe}'`,
  ].join(" \\\n");
}
