import { defineConfig } from "vitest/config";

// Runs after `npm run bundle`, against dist/betternotez-mcp.mjs. Kept out of the default run.
export default defineConfig({
  test: {
    include: ["src/bundle.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
