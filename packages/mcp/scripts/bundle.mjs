import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const coreSource = fileURLToPath(new URL("../../core/src/", import.meta.url));

// Bundles from core's source, so the file never depends on a prior core build.
const coreFromSource = {
  name: "core-from-source",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@betternotez\/core(\/node)?$/ }, (args) => ({
      path: args.path === "@betternotez/core" ? `${coreSource}index.ts` : `${coreSource}node.ts`,
    }));
  },
};

await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../dist/betternotez-mcp.mjs", import.meta.url)),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  plugins: [coreFromSource],
  logLevel: "warning",
});
