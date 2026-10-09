import { describe, expect, it } from "vitest";
import type { TextPiece } from "./highlight";
import { isBreakBetween, sameTextPieces } from "./text-selection";

/** A run 18 points tall on screen, starting at the given edge and top. */
function run(left: number, top: number, width: number) {
  return { left, top, right: left + width, height: 18 };
}

describe("isBreakBetween", () => {
  it("breaks where the next run starts a new line of the page", () => {
    expect(isBreakBetween(run(100, 200, 80), run(100, 220, 80))).toBe(true);
  });

  it("breaks where a clear gap separates two runs on one line, as a word space does", () => {
    // A 5 point gap is a little under a third of an em at 18 points, which is what a word space is.
    expect(isBreakBetween(run(100, 200, 80), run(185, 200, 40))).toBe(true);
  });

  it("does not break between runs that touch, so one word stays one word", () => {
    expect(isBreakBetween(run(100, 200, 80), run(180, 200, 40))).toBe(false);
    // A gap well under a tenth of the font height is spacing between letters, not a word.
    expect(isBreakBetween(run(100, 200, 80), run(180.5, 200, 40))).toBe(false);
  });
});

const piece: TextPiece = {
  page: 1,
  text: "Gates and truth",
  rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.03 }],
};

describe("sameTextPieces", () => {
  it("treats a reading of the same text in the same place as unchanged", () => {
    expect(sameTextPieces([piece], [{ ...piece, rects: piece.rects.map((rect) => ({ ...rect })) }])).toBe(true);
  });

  it("sees a change of text, page, or box", () => {
    expect(sameTextPieces([piece], [{ ...piece, text: "Gates and truth tables" }])).toBe(false);
    expect(sameTextPieces([piece], [{ ...piece, page: 2 }])).toBe(false);
    expect(sameTextPieces([piece], [{ ...piece, rects: [{ ...piece.rects[0]!, width: 0.31 }] }])).toBe(false);
  });

  it("sees a selection appear, disappear, or gain a page", () => {
    expect(sameTextPieces(undefined, undefined)).toBe(true);
    expect(sameTextPieces(undefined, [piece])).toBe(false);
    expect(sameTextPieces([piece], undefined)).toBe(false);
    expect(sameTextPieces([piece], [piece, { ...piece, page: 2 }])).toBe(false);
  });
});
