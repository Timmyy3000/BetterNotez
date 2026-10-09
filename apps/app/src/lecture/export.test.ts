import type { Annotation, Highlight } from "@betternotez/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AnnotationId } from "@betternotez/core";
import { exportAnnotatedPdf } from "./export";

/** Each page is 300 by 400 points and holds its own number as text. */
async function makePdf(pageCount: number, rotation = 0): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let number = 1; number <= pageCount; number += 1) {
    const page = pdf.addPage([300, 400]);
    if (rotation !== 0) page.setRotation(degrees(rotation));
    page.drawText(`Original page ${number}`, { x: 20, y: 300, size: 12, font });
  }
  return pdf.save();
}

async function openPdf(bytes: Uint8Array) {
  return pdfjs.getDocument({ data: bytes.slice(), disableFontFace: true }).promise;
}

function textBox(overrides: Partial<Extract<Annotation, { kind: "text" }>>): Annotation {
  return {
    id: AnnotationId.parse("01TEXTBOXEXPORT0000000000"),
    kind: "text",
    page: 2,
    author: "user",
    x: 0.1,
    y: 0.2,
    width: 0.5,
    height: 0.2,
    text: "Hello lecture",
    fontSize: 14,
    color: "#dc2626",
    ...overrides,
  };
}

type OperatorList = { fnArray: number[]; argsArray: unknown[] };

/**
 * The first filled path on a page as x, y, width, height in PDF points. pdf-lib places each box
 * with a translation inside its own save and restore pair, and pdf.js reports the path's extents
 * in that local space, so the box is the translation plus the extents.
 */
function filledBox(list: OperatorList): number[] | undefined {
  let x = 0;
  let y = 0;
  for (let index = 0; index < list.fnArray.length; index += 1) {
    const fn = list.fnArray[index];
    if (fn === pdfjs.OPS.save) {
      x = 0;
      y = 0;
    } else if (fn === pdfjs.OPS.transform) {
      const [, , , , dx = 0, dy = 0] = list.argsArray[index] as number[];
      x += dx;
      y += dy;
    } else if (fn === pdfjs.OPS.constructPath) {
      const [, , [left = 0, bottom = 0, right = 0, top = 0] = []] = list.argsArray[index] as [unknown, unknown, number[]];
      return [x + left, y + bottom, right - left, top - bottom].map((value) => Math.round(value * 1000) / 1000);
    }
  }
  return undefined;
}

/** The blend modes and opacities of every graphics state the page sets, as pdf.js reports them. */
function graphicsStates(list: OperatorList): unknown[] {
  return list.fnArray.flatMap((fn, index) => (fn === pdfjs.OPS.setGState ? [list.argsArray[index]] : []));
}

describe("exportAnnotatedPdf", () => {
  it("draws a text box on its own page and leaves the other pages without it", async () => {
    const exported = await exportAnnotatedPdf(await makePdf(3), [textBox({})]);
    const pdf = await openPdf(exported);

    const onPage2 = (await (await pdf.getPage(2)).getTextContent()).items.map((item) => ("str" in item ? item.str : ""));
    const onPage1 = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : ""));
    expect(pdf.numPages).toBe(3);
    expect(onPage2.join("")).toContain("Hello lecture");
    expect(onPage1.join("")).not.toContain("Hello");
  });

  it("places the text where the box is, measured from the top-left of an unrotated page", async () => {
    const pdf = await openPdf(await exportAnnotatedPdf(await makePdf(3), [textBox({})]));
    const page = await pdf.getPage(2);
    const item = (await page.getTextContent()).items.find((entry) => "str" in entry && entry.str.includes("Hello"));
    if (item === undefined || !("transform" in item)) throw new Error("exported text not found");

    const [x, y] = page.getViewport({ scale: 1 }).convertToViewportPoint(item.transform[4] ?? 0, item.transform[5] ?? 0);
    // Box left 30pt plus 4pt padding. Box top 80pt plus 4pt padding plus 95% of the 14pt font size to the baseline.
    expect(x).toBeCloseTo(34, 1);
    expect(y).toBeCloseTo(97.3, 1);
  });

  it("keeps the text on the same spot of a page rotated 90 degrees clockwise", async () => {
    const pdf = await openPdf(await exportAnnotatedPdf(await makePdf(3, 90), [textBox({})]));
    const page = await pdf.getPage(2);
    const item = (await page.getTextContent()).items.find((entry) => "str" in entry && entry.str.includes("Hello"));
    if (item === undefined || !("transform" in item)) throw new Error("exported text not found");

    const viewport = page.getViewport({ scale: 1 });
    expect(viewport.width).toBe(400);
    expect(viewport.height).toBe(300);
    const [x, y] = viewport.convertToViewportPoint(item.transform[4] ?? 0, item.transform[5] ?? 0);
    // The box's left and top, as the reader sees them on the rotated page, are 0.1 and 0.2 of 400 by 300.
    expect(x).toBeCloseTo(44, 1);
    expect(y).toBeCloseTo(77.3, 1);
  });

  it("draws a pen stroke as a filled path on its page", async () => {
    const stroke: Annotation = {
      id: AnnotationId.parse("01INKEXPORT00000000000000"),
      kind: "ink",
      page: 3,
      author: "user",
      points: [
        [0.1, 0.1, 0.5],
        [0.4, 0.3, 0.5],
        [0.6, 0.5, 0.5],
      ],
      color: "#2563eb",
      size: 3,
    };
    const pdf = await openPdf(await exportAnnotatedPdf(await makePdf(3), [stroke]));
    const pageThree = await (await pdf.getPage(3)).getOperatorList();
    const pageOne = await (await pdf.getPage(1)).getOperatorList();

    expect(pageThree.fnArray).toContain(pdfjs.OPS.constructPath);
    expect(pageOne.fnArray).not.toContain(pdfjs.OPS.constructPath);
  });

  it("draws a highlight as a multiply rectangle over its words, on its page only", async () => {
    // The box covers the page 2 line, which is drawn at y 300 of a 400-point page.
    const highlightBox: Highlight = {
      id: AnnotationId.parse("01HIGHLIGHTEXPORT0000000"),
      kind: "highlight",
      page: 2,
      author: "user",
      rects: [{ x: 0.2, y: 0.2, width: 0.4, height: 0.07 }],
      text: "Original page 2",
      color: "#a8701b",
    };
    const pdf = await openPdf(await exportAnnotatedPdf(await makePdf(3), [highlightBox]));
    const pageTwo = await (await pdf.getPage(2)).getOperatorList();
    const pageOne = await (await pdf.getPage(1)).getOperatorList();

    expect(JSON.stringify(graphicsStates(pageTwo))).toContain("multiply");
    expect(JSON.stringify(graphicsStates(pageTwo))).toContain('"ca",0.35');
    expect(graphicsStates(pageOne)).toEqual([]);
    // The box runs from x 60 to 180 and from y 292 to 320 in PDF points, measured from the page's lower left.
    expect(filledBox(pageTwo)).toEqual([60, 292, 120, 28]);
  });

  it("finds the box on a page rotated 90 degrees clockwise", async () => {
    const highlightBox: Highlight = {
      id: AnnotationId.parse("01HIGHLIGHTROTATED00000000"),
      kind: "highlight",
      page: 1,
      author: "user",
      rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.1 }],
      text: "Original page 1",
      color: "#2b4b78",
    };
    const pdf = await openPdf(await exportAnnotatedPdf(await makePdf(1, 90), [highlightBox]));

    // On the reader's 400 by 300 page the box spans x 40 to 160 and y 60 to 90. Unrotated, that is
    // x 60 to 90 and y 40 to 160.
    expect(filledBox(await (await pdf.getPage(1)).getOperatorList())).toEqual([60, 40, 30, 120]);
  });

  it("writes characters Helvetica cannot draw as question marks instead of failing", async () => {
    const exported = await exportAnnotatedPdf(await makePdf(1), [textBox({ page: 1, text: "x → y" })]);
    const pdf = await openPdf(exported);
    const text = (await (await pdf.getPage(1)).getTextContent()).items.map((item) => ("str" in item ? item.str : "")).join("");

    expect(text).toContain("x ? y");
  });
});
