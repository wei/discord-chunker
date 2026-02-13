import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
    testTimeout: 30000,
    include: ["test/**/*.test.ts", "test/**/*.integration.ts"],
  },
});
