import {
  HIGHLIGHT_COLOR_NAMES,
  HIGHLIGHT_COLORS,
  highlightColorOf,
  InvalidError,
  type Library,
  NotFoundError,
} from "@betternotez/core";
import { z } from "zod";
import { readPageGlyphs } from "../pdf.js";
import type { ToolRegistry } from "../registry.js";
import { chooseMatch, findTextMatches } from "../text-match.js";
import {
  annotationRef,
  hexColor,
  inkPoint,
  lectureRef,
  pageRef,
  toInkPoint,
  unitCoordinate,
} from "./shared.js";

const TEXT_BOX_ONLY: readonly string[] = ["x", "y", "width", "height", "text", "fontSize", "bold", "italic", "underline"];
const INK_ONLY: readonly string[] = ["points", "size"];

const fontSize = z.number().positive().describe("Font size in points. The app's sizes are 11, 14, 18, and 24.");

const annotationPatch = z
  .object({
    page: pageRef.optional(),
    color: hexColor.optional(),
    x: unitCoordinate.optional(),
    y: unitCoordinate.optional(),
    width: unitCoordinate.optional(),
    height: unitCoordinate.optional(),
    text: z.string().optional(),
    fontSize: fontSize.optional(),
    bold: z.boolean().optional().describe("Bold text."),
    italic: z.boolean().optional().describe("Italic text. false makes it upright."),
    underline: z.boolean().optional().describe("Underline the text."),
    points: z.array(inkPoint).min(1).optional(),
    size: z.number().positive().optional(),
  })
  .describe(
    "Fields to change. Text boxes take x, y, width, height, text, fontSize, bold, italic, underline. Ink takes points and size. Both take page and color.",
  );

export function registerAnnotationTools(tools: ToolRegistry, library: Library): void {
  tools.tool(
    "add_text_box",
    "Add a text box to a PDF page. Coordinates are normalized 0 to 1 from the page's top-left corner. Text is italic unless italic is false. Bold and underline are off unless set. The annotation author is ai.",
    {
      lectureId: lectureRef,
      page: pageRef,
      x: unitCoordinate.describe("Left edge, 0 to 1."),
      y: unitCoordinate.describe("Top edge, 0 to 1."),
      width: unitCoordinate.default(0.3).describe("Width, 0 to 1 of the page width."),
      height: unitCoordinate.default(0.08).describe("Height, 0 to 1 of the page height."),
      text: z.string(),
      fontSize: fontSize.default(14),
      bold: z.boolean().optional().describe("Bold text. Off when omitted."),
      italic: z.boolean().optional().describe("Italic text. On when omitted. Send false for upright text."),
      underline: z.boolean().optional().describe("Underline the text. Off when omitted."),
      color: hexColor.default("#000000"),
    },
    ({ lectureId, ...box }) => library.addAnnotation(lectureId, { ...box, kind: "text", author: "ai" }),
  );

  tools.tool(
    "add_ink",
    "Add a freehand stroke to a PDF page, for sketches and diagrams. Points are [x, y] or [x, y, pressure], normalized 0 to 1 from the page's top-left corner. The annotation author is ai.",
    {
      lectureId: lectureRef,
      page: pageRef,
      points: z.array(inkPoint).min(1),
      color: hexColor.default("#000000"),
      size: z.number().positive().default(2).describe("Stroke width."),
    },
    ({ lectureId, page, points, color, size }) =>
      library.addAnnotation(lectureId, {
        kind: "ink",
        author: "ai",
        page,
        points: points.map(toInkPoint),
        color,
        size,
      }),
  );

  tools.tool(
    "add_highlight",
    "Highlight text on a page of a PDF in the library. Pass the text exactly as it appears on the page, with the same capitals and punctuation. Line breaks and spacing do not matter. If the text appears more than once on the page, pass occurrence to choose one. The colour is one of the highlight colours, yellow by default. The annotation author is ai, and the student can change or remove the highlight in the app.",
    {
      lectureId: lectureRef,
      page: pageRef,
      text: z.string().min(1).describe("The text to highlight, exactly as it appears on the page."),
      occurrence: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Which match to highlight when the text appears more than once on the page, counting from 1."),
      color: z
        .enum(HIGHLIGHT_COLOR_NAMES)
        .default(HIGHLIGHT_COLORS[0].name)
        .describe("The highlight colour: yellow, green, pink, blue, or orange."),
    },
    async ({ lectureId, page, text, occurrence, color }) => {
      const { pageCount } = await library.getLecture(lectureId);
      if (page > pageCount) {
        throw new InvalidError(`Page ${page} is outside the ${pageCount} pages of this PDF.`);
      }
      const glyphs = await readPageGlyphs(await library.getPdf(lectureId), page);
      const rects = chooseMatch(findTextMatches(glyphs, text), text, page, occurrence);
      return library.addAnnotation(lectureId, {
        kind: "highlight",
        author: "ai",
        page,
        rects,
        text: text.replace(/\s+/g, " ").trim(),
        color: highlightColorOf(color),
      });
    },
  );

  tools.tool(
    "update_annotation",
    "Change a text box or ink stroke on a piece of material. Send only the fields that apply to that annotation's kind. A text box can change its size, bold, italic, underline, and color. The author cannot change. Highlights cannot be changed here.",
    {
      lectureId: lectureRef,
      annotationId: annotationRef,
      patch: annotationPatch,
    },
    async ({ lectureId, annotationId, patch }) => {
      const current = (await library.listAnnotations(lectureId)).find(
        (annotation) => annotation.id === annotationId,
      );
      if (current === undefined) {
        throw new NotFoundError("Annotation", annotationId);
      }
      if (current.kind === "highlight") {
        throw new InvalidError("An assistant cannot change a highlight. The student can change or remove it in the app.");
      }

      const changed = Object.entries(patch)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      if (changed.length === 0) {
        throw new InvalidError("The patch has no fields to change.");
      }

      const wrongKind = current.kind === "text" ? INK_ONLY : TEXT_BOX_ONLY;
      const misplaced = changed.filter((key) => wrongKind.includes(key));
      if (misplaced.length > 0) {
        const kindName = current.kind === "text" ? "a text box" : "an ink stroke";
        throw new InvalidError(`${misplaced.join(", ")} does not apply to ${kindName}.`);
      }

      const next =
        patch.points === undefined ? patch : { ...patch, points: patch.points.map(toInkPoint) };
      return library.updateAnnotation(lectureId, annotationId, next);
    },
  );
}
