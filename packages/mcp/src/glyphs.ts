import type { PageRect } from "@betternotez/core";

/** One character as the page draws it. Its box is in normalized page coordinates, origin at the top-left. */
export interface Glyph {
  readonly text: string;
  readonly rect: PageRect;
}

/**
 * A run of text placed on the page the way pdf.js's text layer places it. `transform` maps the run's
 * glyph space into page pixels, with the origin at the top-left. `length` is the run's advance in page
 * pixels.
 */
export interface PlacedRun {
  readonly str: string;
  readonly transform: readonly number[];
  readonly length: number;
  /** Writes top to bottom, so the run is turned a quarter turn, as the text layer turns it. */
  readonly vertical: boolean;
}

/**
 * The top of a span sits this far above its baseline, as a fraction of the font's height. The browser measures
 * each font's real ascent. This is the fallback pdf.js uses for the common sans and serif faces.
 */
export const TEXT_LAYER_ASCENT = 0.8;

/**
 * Boxes every character of the placed runs, in page fractions. A run's own box is exact, but pdf.js gives
 * one length per run, so its characters share that length in proportion to their count. Each box is the
 * band the text layer's span covers for that character, so a highlight lines up with the letters it marks.
 */
export function glyphsOf(runs: readonly PlacedRun[], pageWidth: number, pageHeight: number): Glyph[] {
  const glyphs: Glyph[] = [];

  for (const run of runs) {
    const characters = Array.from(run.str);
    const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = run.transform;
    // The span's direction along the text, and its direction up the font, as the text layer's rotation gives them.
    const quarter = run.vertical ? Math.PI / 2 : 0;
    const angle = Math.atan2(b, a) + quarter;
    const height = Math.hypot(c, d);
    if (characters.length === 0 || height === 0) continue;

    const along: readonly [number, number] = [Math.cos(angle), Math.sin(angle)];
    // Up the page, against the screen's downward y axis. This matches the span placement in pdf.js.
    const up: readonly [number, number] = [Math.sin(angle), -Math.cos(angle)];
    // The span is one font height tall and its top sits one ascent above the baseline. Its box runs from there down.
    const top = TEXT_LAYER_ASCENT * height;
    const bottom = (TEXT_LAYER_ASCENT - 1) * height;
    const baseline: readonly [number, number] = [x, y];

    characters.forEach((character, index) => {
      const start = (run.length * index) / characters.length;
      const end = (run.length * (index + 1)) / characters.length;
      const corners = [
        pointAt(baseline, along, up, start, top),
        pointAt(baseline, along, up, end, top),
        pointAt(baseline, along, up, start, bottom),
        pointAt(baseline, along, up, end, bottom),
      ];
      glyphs.push({ text: character, rect: boxOf(corners, pageWidth, pageHeight) });
    });
  }
  return glyphs;
}

function pointAt(
  origin: readonly [number, number],
  along: readonly [number, number],
  up: readonly [number, number],
  distance: number,
  rise: number,
): [number, number] {
  return [origin[0] + along[0] * distance + up[0] * rise, origin[1] + along[1] * distance + up[1] * rise];
}

/** The smallest box around the points, in page fractions, clipped to the page. */
function boxOf(points: readonly (readonly [number, number])[], pageWidth: number, pageHeight: number): PageRect {
  const xs = points.map(([x]) => clamp01(x / pageWidth));
  const ys = points.map(([, y]) => clamp01(y / pageHeight));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
