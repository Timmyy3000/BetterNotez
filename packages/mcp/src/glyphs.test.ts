import { describe, expect, it } from "vitest";
import { glyphsOf, type PlacedRun } from "./glyphs.js";

/** A 200 by 200 point page at one pixel per point, so page fractions are easy to read. */
const WIDTH = 200;
const HEIGHT = 200;

/** A 10 point run whose baseline starts at (50, 100) from the top-left, as pdf.js places an upright run. */
function run(str: string, overrides: Partial<PlacedRun> = {}): PlacedRun {
  return {
    str,
    transform: [10, 0, 0, -10, 50, 100],
    length: 6.67 * str.length,
    vertical: false,
    ...overrides,
  };
}

describe("glyphsOf", () => {
  it("boxes a character from the span the text layer draws for it", () => {
    const [first] = glyphsOf([run("A", { length: 6.67 })], WIDTH, HEIGHT);

    // The span's top is 0.8 of the 10 point font above the baseline, and its box runs 2 points below it.
    expect(first?.text).toBe("A");
    expect(first?.rect.x).toBeCloseTo(50 / WIDTH, 6);
    expect(first?.rect.width).toBeCloseTo(6.67 / WIDTH, 6);
    expect(first?.rect.y).toBeCloseTo((100 - 8) / HEIGHT, 6);
    expect(first?.rect.height).toBeCloseTo(10 / HEIGHT, 6);
  });

  it("shares a run's length between its characters in proportion to their count", () => {
    const glyphs = glyphsOf([run("AB", { length: 12 })], WIDTH, HEIGHT);

    const [a, b] = glyphs;
    expect(a?.rect.x).toBeCloseTo(50 / WIDTH, 6);
    expect(b?.rect.x).toBeCloseTo(56 / WIDTH, 6);
    expect(a?.rect.width).toBeCloseTo(6 / WIDTH, 6);
    expect(b?.rect.width).toBeCloseTo(6 / WIDTH, 6);
  });

  it("is exact for a fixed-width font, where every character takes the same share of the run", () => {
    // Courier draws each character 6 points wide at 10 points, so a count of characters is their true position.
    const glyphs = glyphsOf([run("Gates", { length: 30 })], WIDTH, HEIGHT);

    expect(glyphs[4]?.rect.x).toBeCloseTo((50 + 24) / WIDTH, 6);
    expect(glyphs[4]?.rect.width).toBeCloseTo(6 / WIDTH, 6);
  });

  it("reads each character of a run as its own glyph, including a ligature's letters", () => {
    const [ligature] = glyphsOf([run("ﬁ", { length: 8 })], WIDTH, HEIGHT);

    expect(ligature?.text).toBe("ﬁ");
    expect(ligature?.rect.width).toBeCloseTo(8 / WIDTH, 6);
  });

  it("runs a vertical run down the page, along its own length", () => {
    // pdf.js turns a vertical run a quarter turn, so its characters stack downwards along its height.
    const glyphs = glyphsOf([run("AB", { length: 20, vertical: true })], WIDTH, HEIGHT);

    const [top, next] = glyphs.map((glyph) => glyph.rect.y);
    expect(next).toBeGreaterThan(top ?? 0);
    expect((next ?? 0) - (top ?? 0)).toBeCloseTo(10 / HEIGHT, 6);
  });

  it("clips a box to the page, so a run that runs off the edge stays on the page", () => {
    const [edge] = glyphsOf([run("W", { transform: [20, 0, 0, -20, 195, 195], length: 20 })], WIDTH, HEIGHT);
    if (edge === undefined) throw new Error("no glyph was placed");

    expect(edge.rect.x + edge.rect.width).toBeLessThanOrEqual(1);
    expect(edge.rect.y + edge.rect.height).toBeLessThanOrEqual(1);
  });

  it("gives a run that lies off the page no visible area, so it cannot be mistaken for a highlight", () => {
    const [outside] = glyphsOf([run("W", { transform: [10, 0, 0, -10, 400, 100], length: 10 })], WIDTH, HEIGHT);

    expect(outside?.rect.width).toBe(0);
  });

  it("skips a run with no characters or no height", () => {
    expect(glyphsOf([run(""), run("A", { transform: [0, 0, 0, 0, 50, 100] })], WIDTH, HEIGHT)).toEqual([]);
  });
});
