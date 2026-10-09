import { InvalidError, type Library, NotFoundError } from "@betternotez/core";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import {
  annotationRef,
  hexColor,
  inkPoint,
  lectureRef,
  pageRef,
  toInkPoint,
  unitCoordinate,
} from "./shared.js";

const TEXT_BOX_ONLY: readonly string[] = ["x", "y", "width", "height", "text", "fontSize"];
const INK_ONLY: readonly string[] = ["points", "size"];

const annotationPatch = z
  .object({
    page: pageRef.optional(),
    color: hexColor.optional(),
    x: unitCoordinate.optional(),
    y: unitCoordinate.optional(),
    width: unitCoordinate.optional(),
    height: unitCoordinate.optional(),
    text: z.string().optional(),
    fontSize: z.number().positive().optional(),
    points: z.array(inkPoint).min(1).optional(),
    size: z.number().positive().optional(),
  })
  .describe("Fields to change. Text boxes take x, y, width, height, text, fontSize. Ink takes points and size. Both take page and color.");

export function registerAnnotationTools(tools: ToolRegistry, library: Library): void {
  tools.tool(
    "add_text_box",
    "Add a text box to a PDF page. Coordinates are normalized 0 to 1 from the page's top-left corner. The annotation author is ai.",
    {
      lectureId: lectureRef,
      page: pageRef,
      x: unitCoordinate.describe("Left edge, 0 to 1."),
      y: unitCoordinate.describe("Top edge, 0 to 1."),
      width: unitCoordinate.default(0.3).describe("Width, 0 to 1 of the page width."),
      height: unitCoordinate.default(0.08).describe("Height, 0 to 1 of the page height."),
      text: z.string(),
      fontSize: z.number().positive().default(14),
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
    "update_annotation",
    "Change a text box or ink stroke on a piece of material. Send only the fields that apply to that annotation's kind. The author cannot change.",
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

      const changed = Object.entries(patch)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      if (changed.length === 0) {
        throw new InvalidError("The patch has no fields to change.");
      }

      const wrongKind = current.kind === "text" ? INK_ONLY : TEXT_BOX_ONLY;
      const misplaced = changed.filter((key) => wrongKind.includes(key));
      if (misplaced.length > 0) {
        const kindName = current.kind === "text" ? "text box" : "ink stroke";
        throw new InvalidError(`${misplaced.join(", ")} does not apply to a ${kindName}.`);
      }

      const next =
        patch.points === undefined ? patch : { ...patch, points: patch.points.map(toInkPoint) };
      return library.updateAnnotation(lectureId, annotationId, next);
    },
  );
}
