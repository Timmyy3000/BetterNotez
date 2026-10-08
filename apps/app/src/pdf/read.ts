import { getDocument, PasswordException, type PDFDocumentProxy } from "./pdfjs";
import { UnreadablePdfError } from "./errors";

export interface PdfContent {
  readonly pageCount: number;
  /** Text of each page. Index 0 is page 1. */
  readonly pages: readonly string[];
}

/** Reads the page count and the text of every page. Throws UnreadablePdfError when pdf.js cannot use the file. */
export async function readPdf(bytes: Uint8Array): Promise<PdfContent> {
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const task = getDocument({ data: bytes.slice() });
  let pdf: PDFDocumentProxy;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy();
    throw unreadable(error);
  }

  try {
    if (pdf.numPages < 1) {
      throw new UnreadablePdfError("corrupt");
    }
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      pages.push(text.replace(/\s+/g, " ").trim());
    }
    return { pageCount: pdf.numPages, pages };
  } catch (error) {
    throw unreadable(error);
  } finally {
    await task.destroy();
  }
}

function unreadable(error: unknown): UnreadablePdfError {
  if (error instanceof UnreadablePdfError) {
    return error;
  }
  return new UnreadablePdfError(error instanceof PasswordException ? "password" : "corrupt");
}
