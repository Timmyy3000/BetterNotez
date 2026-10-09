import { textBoxStyle, type Annotation, type Highlight, type Ink, type TextBox } from "@betternotez/core";
import { BlendMode, degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { displaySize, displayToUser, normalizeRotation, type PageGeometry } from "./geometry";
import { HIGHLIGHT_OPACITY } from "./highlight";
import { outlinePath, strokeOutline } from "./ink";
import { BASELINE_RATIO, LINE_HEIGHT, TEXT_PADDING_PT } from "./text-layout";

/** Helvetica's underline sits 0.1 em under the baseline and is 0.05 em thick, in every Helvetica variant. */
const UNDERLINE_OFFSET_EM = 0.1;
const UNDERLINE_THICKNESS_EM = 0.05;

/**
 * Returns a copy of the PDF with the annotations drawn onto their pages. Text boxes become
 * Helvetica text and ink becomes filled paths, so any PDF viewer shows them. The source bytes
 * are not changed.
 */
export async function exportAnnotatedPdf(pdfBytes: Uint8Array, annotations: readonly Annotation[]): Promise<Uint8Array> {
  const document = await PDFDocument.load(pdfBytes);
  const fonts = new Map<StandardFonts, PDFFont>();
  const pages = document.getPages();

  for (const annotation of paintOrder(annotations)) {
    const page = pages[annotation.page - 1];
    if (page === undefined) continue;
    const geometry = pageGeometry(page);
    if (annotation.kind === "text") {
      await drawTextBox(document, fonts, page, geometry, annotation);
    } else if (annotation.kind === "ink") {
      drawInk(page, geometry, annotation);
    } else {
      drawHighlight(page, geometry, annotation);
    }
  }
  return document.save();
}

/**
 * The order the annotations are drawn in, which is the order the screen stacks them: highlights lie under
 * the page's text, strokes lie over the highlights, and text boxes lie on top. Within a kind, the list's order holds.
 */
export function paintOrder(annotations: readonly Annotation[]): Annotation[] {
  const layer = (annotation: Annotation): number => (annotation.kind === "highlight" ? 0 : annotation.kind === "ink" ? 1 : 2);
  return [...annotations].sort((a, b) => layer(a) - layer(b));
}

function pageGeometry(page: PDFPage): PageGeometry {
  const box = page.getCropBox();
  return {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    rotation: normalizeRotation(page.getRotation().angle),
  };
}

async function drawTextBox(
  document: PDFDocument,
  fonts: Map<StandardFonts, PDFFont>,
  page: PDFPage,
  geometry: PageGeometry,
  box: TextBox,
): Promise<void> {
  const style = textBoxStyle(box);
  const font = await embedVariant(document, fonts, style.bold, style.italic);
  const display = displaySize(geometry);
  const left = box.x * display.width;
  const top = box.y * display.height;
  const maxWidth = box.width * display.width - 2 * TEXT_PADDING_PT;
  const color = hexToRgb(box.color);
  const size = style.fontSize;
  // Text runs along the reading direction of the rotated page, so its underline is turned to match.
  const radians = (geometry.rotation * Math.PI) / 180;
  const along = { x: Math.cos(radians), y: Math.sin(radians) };
  const below = { x: along.y, y: -along.x };

  wrapLines(font, box.text, size, maxWidth).forEach((line, index) => {
    const baseline = top + TEXT_PADDING_PT + size * BASELINE_RATIO + index * size * LINE_HEIGHT;
    const origin = displayToUser(geometry, (left + TEXT_PADDING_PT) / display.width, baseline / display.height);
    page.drawText(line, { x: origin.x, y: origin.y, font, size, color, rotate: degrees(geometry.rotation) });
    if (style.underline && line !== "") {
      const offset = size * UNDERLINE_OFFSET_EM;
      const start = { x: origin.x + below.x * offset, y: origin.y + below.y * offset };
      const width = font.widthOfTextAtSize(line, size);
      page.drawLine({
        start,
        end: { x: start.x + along.x * width, y: start.y + along.y * width },
        thickness: size * UNDERLINE_THICKNESS_EM,
        color,
      });
    }
  });
}

/**
 * Helvetica, the face the export has always drawn, in the box's weight and slant. The screen's serif face
 * has no standard PDF equivalent without embedding a font file, so the export does not match it.
 */
async function embedVariant(
  document: PDFDocument,
  fonts: Map<StandardFonts, PDFFont>,
  bold: boolean,
  italic: boolean,
): Promise<PDFFont> {
  const name = bold
    ? italic
      ? StandardFonts.HelveticaBoldOblique
      : StandardFonts.HelveticaBold
    : italic
      ? StandardFonts.HelveticaOblique
      : StandardFonts.Helvetica;
  const cached = fonts.get(name);
  if (cached !== undefined) return cached;
  const font = await document.embedFont(name);
  fonts.set(name, font);
  return font;
}

function drawInk(page: PDFPage, geometry: PageGeometry, ink: Ink): void {
  const points = ink.points.map(([u, v, pressure]) => {
    const point = displayToUser(geometry, u, v);
    return [point.x, point.y, pressure] as const;
  });
  // The outline is the one on screen. drawSvgPath flips the y axis, so y is negated to cancel that out.
  const outline = strokeOutline(points, ink.size).map(([x, y]): [number, number] => [x, -y]);
  page.drawSvgPath(outlinePath(outline), {
    x: 0,
    y: 0,
    color: hexToRgb(ink.color),
    opacity: ink.opacity ?? 1,
    // A translucent stroke is the highlighter's. It multiplies onto the page, as it does on screen.
    blendMode: ink.opacity !== undefined ? BlendMode.Multiply : undefined,
  });
}

/**
 * Each box is drawn in multiply mode, as on screen, so the words under it stay dark. Each box is
 * turned into the bounding box of its corners in PDF space, which is exact for quarter turns.
 */
function drawHighlight(page: PDFPage, geometry: PageGeometry, highlight: Highlight): void {
  const color = hexToRgb(highlight.color);
  for (const { x, y, width, height } of highlight.rects) {
    const corners = [
      displayToUser(geometry, x, y),
      displayToUser(geometry, x + width, y),
      displayToUser(geometry, x, y + height),
      displayToUser(geometry, x + width, y + height),
    ];
    const left = Math.min(...corners.map((corner) => corner.x));
    const right = Math.max(...corners.map((corner) => corner.x));
    const bottom = Math.min(...corners.map((corner) => corner.y));
    const top = Math.max(...corners.map((corner) => corner.y));
    page.drawRectangle({
      x: left,
      y: bottom,
      width: right - left,
      height: top - bottom,
      color,
      opacity: HIGHLIGHT_OPACITY,
      blendMode: BlendMode.Multiply,
    });
  }
}

/** Greedy word wrap. A single word wider than the box is kept whole and overflows. */
function wrapLines(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of printable(font, text).split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line === "" ? word : `${line} ${word}`;
      if (line !== "" && font.widthOfTextAtSize(candidate, size) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Helvetica has no glyph for most characters outside Latin. Those become "?" rather than failing the export. */
function printable(font: PDFFont, text: string): string {
  return Array.from(text.replace(/\r\n?/g, "\n").replace(/\t/g, "    "), (character) => {
    if (character === "\n") return character;
    try {
      font.encodeText(character);
      return character;
    } catch {
      return "?";
    }
  }).join("");
}

function hexToRgb(hex: string): RGB {
  const value = Number.parseInt(hex.slice(1), 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}
