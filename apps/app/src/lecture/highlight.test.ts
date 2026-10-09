import { AnnotationId, type Highlight } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { anchorOf, highlightAt, pageRectOf, popoverBelow } from "./highlight";

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
