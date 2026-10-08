import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves the web app from a sub-path, so its workflow sets this. Everywhere else it is the root.
  base: process.env.BETTERNOTEZ_BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    // Core is compiled from source, so typecheck, dev, and build never wait on a separate core build.
    alias: {
      "@betternotez/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
