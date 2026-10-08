// Renders src-tauri/app-icon.svg to a 1024px PNG, then writes the desktop icons with the Tauri CLI.
// Run `npm run icon -w @betternotez/app` after editing the SVG, and commit the outputs.
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Resvg } from "@resvg/resvg-js";

const appDir = fileURLToPath(new URL("..", import.meta.url));
const iconDir = `${appDir}src-tauri/icons`;
const source = `${appDir}src-tauri/app-icon.svg`;
const png = `${appDir}src-tauri/app-icon.png`;

const rendered = new Resvg(readFileSync(source), { fitTo: { mode: "width", value: 1024 } }).render();
writeFileSync(png, rendered.asPng());

// A shell is needed so that Windows finds npx.cmd.
const result = spawnSync("npx tauri icon src-tauri/app-icon.png -o src-tauri/icons", {
  cwd: appDir,
  shell: true,
  stdio: "inherit",
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The CLI also writes mobile and Windows Store icons. This desktop-only app does not bundle them.
rmSync(`${iconDir}/android`, { recursive: true, force: true });
rmSync(`${iconDir}/ios`, { recursive: true, force: true });
for (const name of readdirSync(iconDir)) {
  if (/^(Square\d+x\d+Logo|StoreLogo)\.png$/.test(name)) rmSync(`${iconDir}/${name}`);
}
