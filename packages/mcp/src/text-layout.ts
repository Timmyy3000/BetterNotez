import type { PageRect } from "@betternotez/core";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/** One character as the page draws it. Its box is in normalized page coordinates, origin at the top-left. */
export interface Glyph {
  readonly text: string;
  readonly rect: PageRect;
}

/** The operator list of one page, as pdf.js reports it from getOperatorList. */
export interface OperatorList {
  readonly fnArray: readonly number[];
  readonly argsArray: readonly unknown[];
}

/** The page's view box and /Rotate, as pdf.js reports them. */
export interface PageShape {
  readonly view: readonly number[];
  readonly rotate: number;
}

type Matrix = readonly [number, number, number, number, number, number];
type Point = readonly [number, number];

interface TextState {
  readonly ctm: Matrix;
  readonly fontSize: number;
  readonly leading: number;
  readonly charSpacing: number;
  readonly wordSpacing: number;
  /** Horizontal scale as a fraction. PDF stores it as a percentage. */
  readonly scale: number;
  readonly rise: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const INITIAL_STATE: TextState = {
  ctm: IDENTITY,
  fontSize: 1,
  leading: 0,
  charSpacing: 0,
  wordSpacing: 0,
  scale: 1,
  rise: 0,
};
/**
 * A glyph's box runs from a little below the baseline to most of the way up the em. That is the
 * band a text selection covers on screen, so a highlight lines up with the letters it marks.
 */
const BOX_BOTTOM_EM = -0.2;
const BOX_TOP_EM = 0.8;

/**
 * Runs a page's text operators the way a PDF renderer does, and boxes every glyph. Each glyph's
 * width comes from its font, so a match can begin and end between two letters of one text run.
 */
export function layoutGlyphs(list: OperatorList, page: PageShape): Glyph[] {
  const toDisplay = displayMapping(page);
  const glyphs: Glyph[] = [];
  const saved: TextState[] = [];
  let state = INITIAL_STATE;
  // The text matrix (tm) moves with each glyph. The line matrix (tlm) marks where the current line starts.
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;

  function newLine(dx: number, dy: number): void {
    tlm = multiply([1, 0, 0, 1, dx, dy], tlm);
    tm = tlm;
  }

  function show(items: readonly unknown[]): void {
    for (const item of items) {
      if (typeof item === "number") {
        // In a TJ array a number moves the next glyph by that many thousandths of an em, against the writing direction.
        tm = multiply([1, 0, 0, 1, (-item / 1000) * state.fontSize * state.scale, 0], tm);
        continue;
      }
      const glyph = item as { readonly unicode: string; readonly width: number; readonly isSpace: boolean };
      const em = glyph.width / 1000;
      // The text rendering matrix: glyph space, then the text matrix, then the page's own transform.
      const placement = multiply(multiply([state.fontSize * state.scale, 0, 0, state.fontSize, 0, state.rise], tm), state.ctm);
      const corners = [
        apply(placement, 0, BOX_BOTTOM_EM),
        apply(placement, em, BOX_BOTTOM_EM),
        apply(placement, 0, BOX_TOP_EM),
        apply(placement, em, BOX_TOP_EM),
      ];
      glyphs.push({ text: glyph.unicode, rect: boxOf(corners.map(([x, y]) => toDisplay(x, y))) });

      const spacing = state.charSpacing + (glyph.isSpace ? state.wordSpacing : 0);
      tm = multiply([1, 0, 0, 1, (em * state.fontSize + spacing) * state.scale, 0], tm);
    }
  }

  list.fnArray.forEach((fn, index) => {
    const args = list.argsArray[index] as readonly unknown[];
    switch (fn) {
      case OPS.save:
        saved.push(state);
        break;
      case OPS.restore:
        state = saved.pop() ?? state;
        break;
      case OPS.transform:
        state = { ...state, ctm: multiply(matrixOf(args), state.ctm) };
        break;
      case OPS.beginText:
        tm = IDENTITY;
        tlm = IDENTITY;
        break;
      case OPS.setFont:
        state = { ...state, fontSize: numberAt(args, 1) };
        break;
      case OPS.setLeading:
        state = { ...state, leading: numberAt(args, 0) };
        break;
      case OPS.setCharSpacing:
        state = { ...state, charSpacing: numberAt(args, 0) };
        break;
      case OPS.setWordSpacing:
        state = { ...state, wordSpacing: numberAt(args, 0) };
        break;
      case OPS.setHScale:
        state = { ...state, scale: numberAt(args, 0) / 100 };
        break;
      case OPS.setTextRise:
        state = { ...state, rise: numberAt(args, 0) };
        break;
      case OPS.setTextMatrix:
        tm = matrixOf(args);
        tlm = tm;
        break;
      case OPS.moveText:
        newLine(numberAt(args, 0), numberAt(args, 1));
        break;
      case OPS.setLeadingMoveText:
        state = { ...state, leading: -numberAt(args, 1) };
        newLine(numberAt(args, 0), numberAt(args, 1));
        break;
      case OPS.nextLine:
        newLine(0, -state.leading);
        break;
      case OPS.showText:
      case OPS.showSpacedText:
        show(args[0] as readonly unknown[]);
        break;
      case OPS.nextLineShowText:
        newLine(0, -state.leading);
        show(args[0] as readonly unknown[]);
        break;
      case OPS.nextLineSetSpacingShowText:
        state = { ...state, wordSpacing: numberAt(args, 0), charSpacing: numberAt(args, 1) };
        newLine(0, -state.leading);
        show(args[2] as readonly unknown[]);
        break;
    }
  });
  return glyphs;
}

/**
 * Maps a point in PDF user space to the reader's normalized display space, the inverse of the app's
 * displayToUser. The view box is unrotated, so /Rotate turns it a quarter turn at a time.
 */
function displayMapping(page: PageShape): (x: number, y: number) => Point {
  const [x0 = 0, y0 = 0, x1 = 612, y1 = 792] = page.view;
  const width = x1 - x0;
  const height = y1 - y0;
  const quarterTurns = (((Math.round(page.rotate / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  return (x, y) => {
    const u0 = (x - x0) / width;
    const v0 = (y1 - y) / height;
    switch (quarterTurns) {
      case 0:
        return [u0, v0];
      case 1:
        return [1 - v0, u0];
      case 2:
        return [1 - u0, 1 - v0];
      case 3:
        return [v0, 1 - u0];
    }
  };
}

/** PDF row-vector matrices: `a` is applied first, then `b`. */
function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function apply(matrix: Matrix, x: number, y: number): Point {
  return [x * matrix[0] + y * matrix[2] + matrix[4], x * matrix[1] + y * matrix[3] + matrix[5]];
}

/** pdf.js passes a matrix either as six numbers or as one array of six. */
function matrixOf(args: readonly unknown[]): Matrix {
  const values = typeof args[0] === "number" ? args : (args[0] as ArrayLike<number>);
  return [Number(values[0] ?? 0), Number(values[1] ?? 0), Number(values[2] ?? 0), Number(values[3] ?? 0), Number(values[4] ?? 0), Number(values[5] ?? 0)];
}

function numberAt(args: readonly unknown[], index: number): number {
  return Number(args[index] ?? 0);
}

function boxOf(points: readonly Point[]): PageRect {
  const xs = points.map(([x]) => clamp01(x));
  const ys = points.map(([, y]) => clamp01(y));
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { x: left, y: top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
