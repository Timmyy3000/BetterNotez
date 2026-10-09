import { AnnotationId, HIGHLIGHT_COLORS, type Highlight } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { anchorOf, HIGHLIGHT_OPACITY, highlightAt, pageRectOf, popoverBelow } from "./highlight";

/** A letter-sized page on screen, 600 pixels wide, starting at (100, 50). */
const page = { left: 100, top: 50, right: 700, bottom: 1050 };

function screenBox(left: number, top: number, width: number, height: number) {
  return { left, top, right: left + width, bottom: top + height };
}

function highlight(id: string, rects: Highlight["rects"]): Highlight {
  return {
    id: AnnotationId.parse(id),
    kind: "highlight",
    page: 1,
    author: "user",
    rects,
    text: id,
    color: "#a8701b",
  };
}

describe("pageRectOf", () => {
  it("turns a box on the screen into fractions of the page", () => {
    const rect = pageRectOf(screenBox(160, 250, 120, 40), page);

    expect(rect?.x).toBeCloseTo(0.1);
    expect(rect?.y).toBeCloseTo(0.2);
    expect(rect?.width).toBeCloseTo(0.2);
    expect(rect?.height).toBeCloseTo(0.04);
  });

  it("keeps the part of a box that runs off the page's edge", () => {
    const rect = pageRectOf(screenBox(650, 50, 100, 20), page);

    expect(rect?.x).toBeCloseTo(550 / 600);
    expect(rect?.width).toBeCloseTo(50 / 600);
  });

  it("returns nothing for a box that lies off the page", () => {
    expect(pageRectOf(screenBox(0, 0, 50, 20), page)).toBeUndefined();
  });
});

describe("anchorOf", () => {
  it("centres the popover on the top line and points at the bottom of the last line", () => {
    const anchor = anchorOf([
      { x: 0.2, y: 0.3, width: 0.4, height: 0.02 },
      { x: 0.2, y: 0.33, width: 0.1, height: 0.02 },
    ]);

    expect(anchor.x).toBeCloseTo(0.4);
    expect(anchor.top).toBe(0.3);
    expect(anchor.bottom).toBeCloseTo(0.35);
  });
});

describe("popoverBelow", () => {
  it("opens below a selection that sits at the very top of the page", () => {
    expect(popoverBelow({ x: 0.5, top: 0.01, bottom: 0.03 }, 1000)).toBe(true);
    expect(popoverBelow({ x: 0.5, top: 0.2, bottom: 0.22 }, 1000)).toBe(false);
  });
});

/** The papers a page is read on, as the screen shows a page under a highlight, in 0 to 1 sRGB. */
const PAPERS = {
  // The warm sheet. The white PDF page multiplies onto it, so the page takes its colour.
  warm: [0xe2, 0xd8, 0xc2].map((channel) => channel / 255),
  // The dark sheet. The white page is dimmed to 0.9 of white by the dark theme.
  dark: [0.9, 0.9, 0.9],
  light: [1, 1, 1],
};

describe("highlight colours", () => {
  // A highlight multiplies its colour onto the paper at HIGHLIGHT_OPACITY, which is what the screen and the export both do.
  function onPaper(hex: string, paper: readonly number[]): number[] {
    const hue = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
    return paper.map((channel, index) => channel * (1 - HIGHLIGHT_OPACITY + HIGHLIGHT_OPACITY * (hue[index] ?? 1)));
  }

  function luminance(rgb: readonly number[]): number {
    const [r, g, b] = rgb.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  }

  /** The CIE 1976 colour difference, which tracks how far apart two colours look. */
  function difference(a: readonly number[], b: readonly number[]): number {
    const lab = (rgb: readonly number[]) => {
      const [r = 0, g = 0, bl = 0] = rgb.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
      const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
      const x = f((0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047);
      const y = f(0.2126 * r + 0.7152 * g + 0.0722 * bl);
      const z = f((0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883);
      return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };
    return Math.hypot(...lab(a).map((value, index) => value - (lab(b)[index] ?? 0)));
  }

  it("keeps black text readable on every highlight colour, on each paper", () => {
    for (const swatch of HIGHLIGHT_COLORS) {
      for (const paper of Object.values(PAPERS)) {
        const background = luminance(onPaper(swatch.value, paper));
        // Black text has a luminance of 0, so the contrast ratio is (background + 0.05) / 0.05.
        expect((background + 0.05) / 0.05, `${swatch.label} on a paper`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("makes each highlight colour visible on every paper, and tells the colours apart", () => {
    for (const swatch of HIGHLIGHT_COLORS) {
      for (const paper of Object.values(PAPERS)) {
        expect(difference(onPaper(swatch.value, paper), paper), `${swatch.label} against its paper`).toBeGreaterThan(15);
      }
    }
    for (const [index, first] of HIGHLIGHT_COLORS.entries()) {
      for (const second of HIGHLIGHT_COLORS.slice(index + 1)) {
        expect(difference(onPaper(first.value, PAPERS.warm), onPaper(second.value, PAPERS.warm)), `${first.label} and ${second.label}`).toBeGreaterThan(15);
      }
    }
  });
});

describe("highlightAt", () => {
  it("finds the highlight under a point, on any of its lines", () => {
    const first = highlight("01FIRSTHIGHLIGHT000000000", [
      { x: 0.1, y: 0.1, width: 0.5, height: 0.03 },
      { x: 0.1, y: 0.14, width: 0.2, height: 0.03 },
    ]);

    expect(highlightAt([first], 0.2, 0.15)).toBe(first);
    expect(highlightAt([first], 0.2, 0.5)).toBeUndefined();
  });

  it("picks the highlight drawn last where two overlap, as the screen shows it", () => {
    const under = highlight("01UNDERHIGHLIGHT0000000000", [{ x: 0.1, y: 0.1, width: 0.5, height: 0.05 }]);
    const over = highlight("01OVERHIGHLIGHT00000000000", [{ x: 0.3, y: 0.1, width: 0.5, height: 0.05 }]);

    expect(highlightAt([under, over], 0.4, 0.12)).toBe(over);
  });
});
