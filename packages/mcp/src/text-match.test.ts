import { describe, expect, it } from "vitest";
import { chooseMatch, findTextMatches } from "./text-match.js";
import type { Glyph } from "./text-layout.js";

/** Glyphs laid out one after another on one line, each a tenth of the page wide. */
function line(text: string, top = 0.1): Glyph[] {
  return [...text].map((char, index) => ({
    text: char,
    rect: { x: 0.05 + index * 0.02, y: top, width: 0.02, height: 0.03 },
  }));
}

describe("findTextMatches", () => {
  it("finds the boxes of a phrase on one line", () => {
    const matches = findTextMatches(line("Gates and truth"), "truth");

    expect(matches).toHaveLength(1);
    const [box] = matches[0] ?? [];
    expect(box?.x).toBeCloseTo(0.05 + 10 * 0.02);
    expect(box?.width).toBeCloseTo(5 * 0.02);
    expect(box?.y).toBe(0.1);
    expect(box?.height).toBe(0.03);
  });

  it("ignores spacing, so a phrase matches when the page draws no space glyph", () => {
    expect(findTextMatches(line("Gatesandtruth"), "Gates and truth")).toHaveLength(1);
    expect(findTextMatches(line("Gates and truth"), "Gatesandtruth")).toHaveLength(1);
  });

  it("matches across a line break and returns one box per line", () => {
    const glyphs = [...line("truth", 0.1), ...line("tables", 0.2)];
    const [match] = findTextMatches(glyphs, "truth tables");

    expect(match?.map((box) => box.y)).toEqual([0.1, 0.2]);
  });

  it("keeps letter case", () => {
    expect(findTextMatches(line("Gates"), "gates")).toEqual([]);
  });

  it("reads compatibility forms as their plain letters", () => {
    const ligature: Glyph[] = [{ text: "ﬁ", rect: { x: 0.1, y: 0.1, width: 0.04, height: 0.03 } }];
    expect(findTextMatches(ligature, "fi")).toHaveLength(1);
  });

  it("finds every place a phrase appears, in reading order", () => {
    const matches = findTextMatches([...line("cell and cell", 0.1)], "cell");
    expect(matches.map((match) => match[0]?.x)).toEqual([0.05, 0.05 + 9 * 0.02]);
  });

  it("returns nothing for an empty query", () => {
    expect(findTextMatches(line("Gates"), "   ")).toEqual([]);
  });
});

describe("chooseMatch", () => {
  const twice = [
    [{ x: 0.1, y: 0.1, width: 0.1, height: 0.03 }],
    [{ x: 0.1, y: 0.5, width: 0.1, height: 0.03 }],
  ];

  it("returns the only match", () => {
    expect(chooseMatch([twice[0] ?? []], "cell", 2)).toEqual(twice[0]);
  });

  it("refuses to guess between two matches", () => {
    expect(() => chooseMatch(twice, "cell", 2)).toThrow(
      '"cell" appears 2 times on page 2. Pass occurrence from 1 to 2 to choose one.',
    );
  });

  it("returns the match an occurrence names", () => {
    expect(chooseMatch(twice, "cell", 2, 2)).toEqual(twice[1]);
  });

  it("explains a missing occurrence and a missing text", () => {
    expect(() => chooseMatch(twice, "cell", 2, 3)).toThrow('"cell" appears 2 times on page 2, so occurrence 3 does not exist.');
    expect(() => chooseMatch([], "cell", 2)).toThrow('"cell" is not on page 2.');
  });
});
