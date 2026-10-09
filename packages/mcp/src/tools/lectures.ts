import type { Library } from "@betternotez/core";
import { basename, extname, isAbsolute } from "node:path";
import { z } from "zod";
import { extractPdfText, readPdfFile } from "../pdf.js";
import type { ToolRegistry } from "../registry.js";
import { calendarDate, lectureRef, pageRef, subjectRef } from "./shared.js";

export function registerLectureTools(tools: ToolRegistry, library: Library): void {
  tools.tool(
    "import_lecture",
    "Import a PDF as material from a file on the student's computer. Copies the PDF into the library, caches its text for reading and search, and returns the new material. The title defaults to the file name without its extension.",
    {
      subjectId: subjectRef,
      pdfPath: z
        .string()
        .refine(isAbsolute, "must be an absolute path.")
        .describe("Absolute path to the PDF file on the student's computer."),
      title: z.string().min(1).optional(),
      date: calendarDate.optional(),
    },
    async ({ subjectId, pdfPath, title, date }) => {
      const bytes = await readPdfFile(pdfPath);
      const pages = await extractPdfText(bytes);
      const lecture = await library.importLecture(
        subjectId,
        title ?? basename(pdfPath, extname(pdfPath)),
        bytes,
        pages.length,
        date,
      );
      await library.setPdfText(lecture.id, pages);
      return lecture;
    },
  );

  tools.tool(
    "get_lecture",
    "Get one piece of material with its notes, annotations, and whether its PDF text is cached. Notes are kept per page, and each one names its page. Pages without a note are left out. Pass page to read only that page's note. Annotation ids here are what update_annotation takes.",
    { lectureId: lectureRef, page: pageRef.optional() },
    async ({ lectureId, page }) => ({
      lecture: await library.getLecture(lectureId),
      notes: await pageNotes(library, lectureId, page),
      annotations: await library.listAnnotations(lectureId),
      pdfTextCached: (await library.getPdfText(lectureId)) !== undefined,
    }),
  );

  tools.tool(
    "get_lecture_text",
    "Read the PDF text of a piece of material, one entry per page. Pass fromPage and toPage to read part of a long PDF.",
    {
      lectureId: lectureRef,
      fromPage: pageRef.optional(),
      toPage: pageRef.optional(),
    },
    async ({ lectureId, fromPage = 1, toPage }) => {
      const lecture = await library.getLecture(lectureId);
      const pages = await library.getPdfText(lectureId);
      if (pages === undefined) {
        throw new Error(
          "The PDF text for this material is not cached yet. Ask the student to open the material once in BetterNotez so its text is saved.",
        );
      }
      const last = toPage ?? lecture.pageCount;
      if (fromPage > last || last > lecture.pageCount) {
        throw new Error(
          `Pages must be between 1 and ${lecture.pageCount}, and fromPage must not be greater than toPage.`,
        );
      }
      return {
        lectureId,
        pages: pages.slice(fromPage - 1, last).map((text, index) => ({ page: fromPage + index, text })),
      };
    },
  );

  tools.tool(
    "update_lecture",
    "Rename a piece of material or set its date. Pass date as null to clear it.",
    {
      lectureId: lectureRef,
      title: z.string().min(1).optional(),
      date: calendarDate.nullable().optional(),
    },
    ({ lectureId, ...patch }) => library.updateLecture(lectureId, patch),
  );

  tools.tool(
    "update_notes",
    "Edit the note on one page of a piece of material. Use mode append (the default) to add to that page's note. Use replace only when the student asks to rewrite it, because replace removes what the page's note says now. Other pages are not changed.",
    {
      lectureId: lectureRef,
      page: pageRef,
      text: z.string().describe("Markdown text to write."),
      mode: z.enum(["append", "replace"]).default("append"),
    },
    async ({ lectureId, page, text, mode }) => {
      if (mode === "replace") {
        await library.setPageNote(lectureId, page, text);
      } else {
        await library.appendPageNote(lectureId, page, text);
      }
      return { lectureId, page, text: await library.getPageNote(lectureId, page) };
    },
  );
}

/** Every page's note, or only the note on `page`. That list is empty when the page has no note. */
async function pageNotes(library: Library, lectureId: string, page: number | undefined) {
  if (page === undefined) {
    return library.listPageNotes(lectureId);
  }
  const text = await library.getPageNote(lectureId, page);
  return text === "" ? [] : [{ page, text }];
}
