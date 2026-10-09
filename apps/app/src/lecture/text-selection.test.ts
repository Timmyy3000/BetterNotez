import { describe, expect, it } from "vitest";
import type { TextPiece } from "./highlight";
import { sameTextPieces } from "./text-selection";

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
