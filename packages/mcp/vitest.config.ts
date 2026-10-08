import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const coreSource = fileURLToPath(new URL("../core/src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@betternotez\/core\/node$/, replacement: `${coreSource}node.ts` },
      { find: /^@betternotez\/core$/, replacement: `${coreSource}index.ts` },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "src/bundle.test.ts"],
  },
});
