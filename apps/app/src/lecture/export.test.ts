import type { Annotation, Highlight, TextBox } from "@betternotez/core";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { degrees, PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { AnnotationId } from "@betternotez/core";
import { exportAnnotatedPdf, paintOrder } from "./export";

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

function textBox(overrides: Partial<TextBox>): TextBox {
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

  it("draws highlights first, then strokes, then text boxes, as the screen stacks them", () => {
    const text = textBox({ id: AnnotationId.parse("01ORDERTEXT000000000000000") });
    const stroke: Annotation = {
      id: AnnotationId.parse("01ORDERINK00000000000000000"),
      kind: "ink",
      page: 2,
      author: "user",
      points: [[0.1, 0.1, 0.5]],
      color: "#2563eb",
      size: 3,
    };
    const highlight: Highlight = {
      id: AnnotationId.parse("01ORDERHIGHLIGHT000000000"),
      kind: "highlight",
      page: 2,
      author: "user",
      rects: [{ x: 0.2, y: 0.2, width: 0.4, height: 0.07 }],
      text: "Original page 2",
      color: "#ffd21f",
    };

    expect(paintOrder([text, stroke, highlight]).map((annotation) => annotation.kind)).toEqual([
      "highlight",
      "ink",
      "text",
    ]);
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

  describe("text formatting", () => {
    /** The base font names the page's resources declare, so a bold box shows up as Helvetica-Bold. */
    async function baseFontsOn(bytes: Uint8Array, pageNumber: number): Promise<string[]> {
      const document = await PDFDocument.load(bytes);
      const resources = document.getPage(pageNumber - 1).node.Resources();
      const fonts = resources?.lookup(PDFName.of("Font"), PDFDict);
      return (fonts?.entries() ?? []).map(([, ref]) => {
        const font = document.context.lookup(ref, PDFDict);
        return String(font?.get(PDFName.of("BaseFont"))).replace(/^\//, "");
      });
    }

    /** The first text item on a page that contains `needle`, with its font size and origin in page points. */
    async function textOf(bytes: Uint8Array, pageNumber: number, needle: string) {
      const pdf = await openPdf(bytes);
      const page = await pdf.getPage(pageNumber);
      const item = (await page.getTextContent()).items.find((entry) => "str" in entry && entry.str.includes(needle));
      if (item === undefined || !("transform" in item)) throw new Error(`exported text "${needle}" not found`);
      const [a = 0, b = 0, , , e = 0, f = 0] = item.transform;
      return { size: Math.hypot(a, b), origin: [e, f] as const, page };
    }

    it("draws a box at the size it was set to", async () => {
      const exported = await exportAnnotatedPdf(await makePdf(3), [textBox({ fontSize: 24 })]);

      expect((await textOf(exported, 2, "Hello")).size).toBeCloseTo(24, 3);
    });

    it("uses the 14 point size for a box that does not set one", async () => {
      const { fontSize: _fontSize, ...withoutSize } = textBox({});
      const exported = await exportAnnotatedPdf(await makePdf(3), [withoutSize as Annotation]);

      expect((await textOf(exported, 2, "Hello")).size).toBeCloseTo(14, 3);
    });

    it("embeds the bold, italic, and bold italic faces of Helvetica", async () => {
      const cases = [
        [{ bold: true, italic: false }, "Helvetica-Bold"],
        [{ bold: false, italic: true }, "Helvetica-Oblique"],
        [{ bold: true, italic: true }, "Helvetica-BoldOblique"],
      ] as const;
      for (const [style, face] of cases) {
        const exported = await exportAnnotatedPdf(await makePdf(3), [textBox(style)]);
        expect(await baseFontsOn(exported, 2)).toContain(face);
      }
    });

    it("draws upright Helvetica for a box with neither bold nor italic", async () => {
      const exported = await exportAnnotatedPdf(await makePdf(3), [textBox({ bold: false, italic: false })]);
      const fonts = await baseFontsOn(exported, 2);

      expect(fonts).not.toContain("Helvetica-Bold");
      expect(fonts).not.toContain("Helvetica-Oblique");
      expect(fonts).not.toContain("Helvetica-BoldOblique");
    });

    it("exports a box with no italic setting in italic, the face it has always been drawn in on screen", async () => {
      const { italic: _italic, ...withoutItalic } = textBox({});
      const exported = await exportAnnotatedPdf(await makePdf(3), [withoutItalic as Annotation]);

      expect(await baseFontsOn(exported, 2)).toContain("Helvetica-Oblique");
    });

    it("draws the text in the box's colour", async () => {
      const exported = await exportAnnotatedPdf(await makePdf(3), [textBox({ color: "#a3321f" })]);
      const page = await (await openPdf(exported)).getPage(2);
      const operators = await page.getOperatorList();
      const fill = operators.fnArray.reduce<number[]>((found, fn, index) => {
        if (fn === pdfjs.OPS.setFillRGBColor) found.push(index);
        return found;
      }, []);
      const last = fill.at(-1);

      expect(last === undefined ? undefined : operators.argsArray[last]).toEqual(["#a3321f"]);
    });

    it("draws a line under each line of an underlined box, and none under a plain one", async () => {
      const underlined = await exportAnnotatedPdf(await makePdf(3), [textBox({ underline: true, text: "One two" })]);
      const plain = await exportAnnotatedPdf(await makePdf(3), [textBox({ text: "One two" })]);
      const strokes = async (bytes: Uint8Array) =>
        (await (await openPdf(bytes)).getPage(2)).getOperatorList().then((list) =>
          list.fnArray.filter((fn) => fn === pdfjs.OPS.constructPath).length,
        );

      expect(await strokes(underlined)).toBeGreaterThan(await strokes(plain));
    });

    /** The bounding box of the last stroked path on a page, as [minX, minY, maxX, maxY] in page points. */
    async function lastStrokeBox(bytes: Uint8Array, pageNumber: number): Promise<number[]> {
      const page = await (await openPdf(bytes)).getPage(pageNumber);
      const operators = await page.getOperatorList();
      const at = operators.fnArray.lastIndexOf(pdfjs.OPS.constructPath);
      const [, , box] = operators.argsArray[at] as [number, unknown, number[]];
      return box;
    }

    it("places the underline under its text, running along the line from the left edge", async () => {
      const exported = await exportAnnotatedPdf(await makePdf(3), [textBox({ underline: true, text: "Hello" })]);
      const { origin } = await textOf(exported, 2, "Hello");
      const [minX = Number.NaN, minY = Number.NaN, maxX = Number.NaN, maxY = Number.NaN] = await lastStrokeBox(exported, 2);

      expect(minX).toBeCloseTo(origin[0], 1);
      expect(maxX).toBeGreaterThan(minX);
      expect(minY).toBeLessThan(origin[1]);
      expect(maxY - minY).toBeLessThan(1);
    });

    it("turns the underline with the text on a page rotated 90 degrees", async () => {
      const exported = await exportAnnotatedPdf(await makePdf(3, 90), [textBox({ underline: true, text: "Hello" })]);
      const { origin, size } = await textOf(exported, 2, "Hello");
      const [minX = Number.NaN, minY = Number.NaN, maxX = Number.NaN, maxY = Number.NaN] = await lastStrokeBox(exported, 2);

      // Rotated text runs up the page in user space, so the underline is a vertical stroke beside the baseline.
      expect(maxX - minX).toBeLessThan(1);
      expect(minX).toBeGreaterThan(origin[0]);
      expect(maxY - minY).toBeGreaterThan(size);
    });
  });
});
