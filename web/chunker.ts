// web/chunker.ts — Re-export chunking logic for browser use
export { chunkContent } from "../src/chunker";
export { parseConfig } from "../src/config";
export type { ChunkerConfig } from "../src/types";
export { DEFAULT_MAX_CHARS, DEFAULT_MAX_LINES } from "../src/types";
