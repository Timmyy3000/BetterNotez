import { InvalidError, mergeLineRects, type PageRect } from "@betternotez/core";
import type { Glyph } from "./glyphs.js";

/**
 * Every place the query appears on the page, as the boxes of its text, one list per place in
 * reading order. Spacing and line breaks are ignored, because many PDFs draw no space glyph and
 * the page's line breaks are not the query's. Letter case and punctuation must match. Compatibility
 * forms such as the "fi" ligature match their plain letters.
 */
export function findTextMatches(glyphs: readonly Glyph[], query: string): PageRect[][] {
  const needle = squash(query);
  if (needle === "") return [];

  // Indexed by UTF-16 unit, the same unit indexOf reports, so a match maps back to the right glyphs.
  const letters: { readonly char: string; readonly glyph: number }[] = [];
  glyphs.forEach((glyph, index) => {
    const text = squash(glyph.text);
    for (let unit = 0; unit < text.length; unit += 1) {
      letters.push({ char: text.charAt(unit), glyph: index });
    }
  });
  const haystack = letters.map((letter) => letter.char).join("");

  const matches: PageRect[][] = [];
  let start = haystack.indexOf(needle);
  while (start !== -1) {
    const glyphIndexes = new Set(letters.slice(start, start + needle.length).map((letter) => letter.glyph));
    // A box with no area is off the page or empty. It is left out, so a match with none is refused by chooseMatch.
    const boxes = [...glyphIndexes].map((index) => glyphs[index]?.rect ?? EMPTY).filter(hasArea);
    matches.push(mergeLineRects(boxes));
    start = haystack.indexOf(needle, start + needle.length);
  }
  return matches;
}

/**
 * The one place to highlight. Text that appears more than once needs an occurrence, so a second
 * copy of a phrase is never highlighted by mistake.
 */
export function chooseMatch(matches: readonly PageRect[][], query: string, page: number, occurrence?: number): PageRect[] {
  const count = matches.length;
  if (count === 0) {
    throw new InvalidError(`"${query}" is not on page ${page}. Check the spelling and capitals against the page text.`);
  }
  if (occurrence === undefined) {
    if (count > 1) {
      throw new InvalidError(
        `"${query}" appears ${count} times on page ${page}. Pass occurrence from 1 to ${count} to choose one.`,
      );
    }
    return visible(matches[0] ?? [], query, page);
  }
  const match = matches[occurrence - 1];
  if (match === undefined) {
    const times = count === 1 ? "once" : `${count} times`;
    throw new InvalidError(`"${query}" appears ${times} on page ${page}, so occurrence ${occurrence} does not exist.`);
  }
  return visible(match, query, page);
}

/** A match with no visible box lies off the page. A highlight of it would be stored and never seen, so it is refused. */
function visible(match: PageRect[], query: string, page: number): PageRect[] {
  if (match.length === 0) {
    throw new InvalidError(`"${query}" is on page ${page}, but outside the visible page, so it cannot be highlighted.`);
  }
  return match;
}

const EMPTY: PageRect = { x: 0, y: 0, width: 0, height: 0 };

function hasArea(rect: PageRect): boolean {
  return rect.width > 0 && rect.height > 0;
}

/** Letters only: compatibility forms unfolded, and every kind of whitespace removed. */
function squash(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "");
}
