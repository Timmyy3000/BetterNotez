import { describe, expect, it } from "vitest";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { layoutGlyphs, type OperatorList } from "./text-layout.js";

/** A 200 by 200 point page, unrotated unless a test says otherwise. */
const PAGE = { view: [0, 0, 200, 200], rotate: 0 };

interface Op {
  readonly fn: number;
  readonly args: readonly unknown[];
}

function listOf(ops: readonly Op[]): OperatorList {
  return { fnArray: ops.map((op) => op.fn), argsArray: ops.map((op) => op.args) };
}

/** Text at a baseline point, at a font size, with each item a glyph or a TJ adjustment. */
function text(x: number, y: number, size: number, items: readonly unknown[]): Op[] {
  return [
    { fn: OPS.beginText, args: [] },
    { fn: OPS.setFont, args: ["F1", size] },
    { fn: OPS.setTextMatrix, args: [1, 0, 0, 1, x, y] },
    { fn: OPS.showSpacedText, args: [items] },
    { fn: OPS.endText, args: [] },
  ];
}

const glyph = (unicode: string, width: number) => ({ unicode, width, isSpace: unicode === " " });

describe("layoutGlyphs", () => {
  it("boxes a glyph from its font width, its size, and its position on the page", () => {
    // A is 667 thousandths of an em wide. At 10 points from (50, 100), its box runs from 98 to 108 points high.
    const [first] = layoutGlyphs(listOf(text(50, 100, 10, [glyph("A", 667)])), PAGE);

    expect(first?.text).toBe("A");
    expect(first?.rect.x).toBeCloseTo(0.25, 4);
    expect(first?.rect.width).toBeCloseTo(6.67 / 200, 4);
    expect(first?.rect.y).toBeCloseTo((200 - 108) / 200, 4);
    expect(first?.rect.height).toBeCloseTo(10 / 200, 4);
  });

  it("starts the next glyph after the advance of the one before", () => {
    const glyphs = layoutGlyphs(listOf(text(50, 100, 10, [glyph("A", 667), glyph("B", 556)])), PAGE);

    expect(glyphs[1]?.rect.x).toBeCloseTo(56.67 / 200, 4);
  });

  it("moves along a TJ adjustment, which shifts the next glyph against the writing direction", () => {
    // After A the pen is at 56.67. A -500 adjustment moves it 5 points further, to 61.67.
    const glyphs = layoutGlyphs(listOf(text(50, 100, 10, [glyph("A", 667), -500, glyph("B", 556)])), PAGE);

    expect(glyphs[1]?.rect.x).toBeCloseTo(61.67 / 200, 4);
  });

  it("applies the page's own transform, so a box follows a figure drawn with a matrix", () => {
    const scaled: Op[] = [
      { fn: OPS.save, args: [] },
      { fn: OPS.transform, args: [2, 0, 0, 2, 0, 0] },
      ...text(25, 50, 10, [glyph("A", 667)]),
      { fn: OPS.restore, args: [] },
    ];
    const [first] = layoutGlyphs(listOf(scaled), PAGE);

    // The scale of 2 puts the baseline at (50, 100) and doubles the 10 point em, so the box runs from 96 to 116.
    expect(first?.rect.x).toBeCloseTo(0.25, 4);
    expect(first?.rect.y).toBeCloseTo((200 - 116) / 200, 4);
    expect(first?.rect.height).toBeCloseTo(20 / 200, 4);
  });

  it("turns the box with a page rotated 90 degrees clockwise", () => {
    const [first] = layoutGlyphs(listOf(text(50, 100, 10, [glyph("A", 667)])), { view: [0, 0, 200, 200], rotate: 90 });

    // On the reader's page, the point (50, 98) of the unrotated page is at (0.49, 0.25).
    expect(first?.rect.x).toBeCloseTo(0.49, 3);
    expect(first?.rect.y).toBeCloseTo(0.25, 3);
    expect(first?.rect.width).toBeCloseTo(0.05, 3);
    expect(first?.rect.height).toBeCloseTo(6.67 / 200, 3);
  });

  it("keeps every box inside the page", () => {
    const [edge] = layoutGlyphs(listOf(text(195, 195, 20, [glyph("W", 944)])), PAGE);
    if (edge === undefined) throw new Error("no glyph was laid out");

    expect(edge.rect.x + edge.rect.width).toBeLessThanOrEqual(1);
    expect(edge.rect.y + edge.rect.height).toBeLessThanOrEqual(1);
  });
});
