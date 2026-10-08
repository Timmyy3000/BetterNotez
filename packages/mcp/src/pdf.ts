import { readFile } from "node:fs/promises";
// Loaded here, not from a sibling file, so the bundled server needs no pdf.worker.mjs next to it.
import "pdfjs-dist/legacy/build/pdf.worker.mjs";
import { getDocument, InvalidPDFException, PasswordException } from "pdfjs-dist/legacy/build/pdf.mjs";

const NOT_PDF = "This file is not a valid PDF. It may be corrupt, or it may not be a PDF at all.";
const PASSWORD_PROTECTED =
  "This PDF is password-protected, so BetterNotez cannot read it. Remove the password in another app, then import it again.";
const NO_PAGES = "This PDF has no pages.";

export async function readPdfFile(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`No file exists at ${path}.`);
    }
    throw error;
  }
}

/** Returns the text of each page. Index 0 is page 1. */
export async function extractPdfText(bytes: Uint8Array): Promise<string[]> {
  // pdf.js detaches the buffer it is given, so it reads a copy and the caller's bytes stay intact.
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const document = await task.promise.catch(rethrowOpenFailure);
    const pages: string[] = [];
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : ""))
          .join("")
          .trim(),
      );
    }
    if (pages.length === 0) {
      throw new Error(NO_PAGES);
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

function rethrowOpenFailure(error: unknown): never {
  if (error instanceof PasswordException) {
    throw new Error(PASSWORD_PROTECTED);
  }
  if (error instanceof InvalidPDFException) {
    throw new Error(NOT_PDF);
  }
  throw error;
}
