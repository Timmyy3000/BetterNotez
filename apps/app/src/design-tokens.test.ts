/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");

/** The hex values declared in one rule of index.css. */
function tokensIn(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)].map((match) => [match[1], match[2]]));
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

// Dark is the default, so it is the root set. Light overrides it in [data-theme="light"].
const THEMES = {
  dark: tokensIn(":root"),
  light: { ...tokensIn(":root"), ...tokensIn('[data-theme="light"]') },
} as const;

/** Text and the surface it sits on. Each must reach WCAG AA, 4.5:1. */
const TEXT_PAIRS: readonly (readonly [string, string])[] = [
  ["foreground", "background"],
  ["foreground", "surface"],
  ["foreground", "raised"],
  ["foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "surface"],
  ["muted-foreground", "raised"],
  ["muted-foreground", "muted"],
  ["faint", "background"],
  ["faint", "surface"],
  ["faint", "raised"],
  ["faint", "muted"],
  ["accent", "background"],
  ["accent", "surface"],
  ["danger", "background"],
  ["danger", "surface"],
  ["accent-foreground", "accent"],
  ["background", "foreground"],
  ["danger-foreground", "danger-solid"],
  ["highlight-foreground", "highlight"],
  ["pen", "sheet"],
  ["sheet-ink", "sheet"],
];

/** Controls and marks that must stand out from their surface, at 3:1 as WCAG requires for UI components. */
const CONTROL_PAIRS: readonly (readonly [string, string])[] = [
  ["control-border", "background"],
  ["control-border", "surface"],
  ["control-border", "raised"],
  ["rule-strong", "surface"],
  ["accent", "background"],
  ["accent", "surface"],
];

const SUBJECT_TONES = ["rose", "orange", "amber", "green", "teal", "blue", "graphite", "umber"] as const;

describe.each(Object.entries(THEMES))("%s theme", (_name, tokens) => {
  it.each(TEXT_PAIRS)("%s on %s reads at 4.5:1 or better", (text, surface) => {
    expect(contrast(tokens[text] ?? "", tokens[surface] ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it.each(CONTROL_PAIRS)("%s against %s stands out at 3:1 or better", (control, surface) => {
    expect(contrast(tokens[control] ?? "", tokens[surface] ?? "")).toBeGreaterThanOrEqual(3);
  });

  it.each(SUBJECT_TONES.flatMap((tone) => [[tone, "background"], [tone, "surface"]] as const))(
    "subject ink %s stands out on %s at 3:1 or better",
    (tone, surface) => {
      expect(contrast(tokens[`subject-${tone}`] ?? "", tokens[surface] ?? "")).toBeGreaterThanOrEqual(3);
    },
  );
});
