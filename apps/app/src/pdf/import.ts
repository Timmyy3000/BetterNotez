import type { Lecture, Library } from "@betternotez/core";
import { toast } from "sonner";
import { UnreadablePdfError } from "./errors";
import type { PdfContent } from "./read";

export function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

/** Keeps the PDFs in a selection and tells the student which files were skipped. */
export function selectPdfs(files: Iterable<File>): File[] {
  const pdfs: File[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (isPdfFile(file)) {
      pdfs.push(file);
    } else {
      skipped.push(file.name);
    }
  }
  if (skipped.length > 0) {
    toast.error(`Skipped ${skipped.join(", ")}. Only PDF files can be imported.`);
  }
  return pdfs;
}

/**
 * Stores a PDF as a lecture, with its page count and page text so that search can find it.
 * The lecture is titled after the file name. Failures throw a sentence the student can act on.
 */
export async function importPdf(library: Library, subjectId: string, file: File, date?: string): Promise<Lecture> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  // pdf.js is large, so it loads only when a PDF is actually imported.
  const { readPdf } = await import("./read");
  let content: PdfContent;
  try {
    content = await readPdf(bytes);
  } catch (error) {
    throw new Error(`"${file.name}" ${explain(error)}`);
  }

  const title = file.name.replace(/\.pdf$/i, "").trim() || file.name;
  const lecture = await library.importLecture(subjectId, title, bytes, content.pageCount, date);
  try {
    await library.setPdfText(lecture.id, content.pages);
  } catch (error) {
    // A lecture without its text would be invisible to search, so roll it back.
    await library.deleteLecture(lecture.id);
    throw error;
  }
  return lecture;
}

function explain(error: unknown): string {
  if (error instanceof UnreadablePdfError && error.reason === "password") {
    return "is password-protected. Remove the password in another app, then import it again.";
  }
  return "could not be read. The file may be damaged or not a PDF.";
}
