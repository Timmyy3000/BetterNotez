/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8")) as {
  app: { windows: { dragDropEnabled?: boolean }[] };
};

describe("the desktop window", () => {
  it("keeps the native file-drop handler from taking PDFs away from the page", () => {
    expect(config.app.windows[0]?.dragDropEnabled).toBe(false);
  });
});
