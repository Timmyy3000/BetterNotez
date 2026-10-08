import { GlobalWorkerOptions, getDocument, PasswordException, type PDFDocumentLoadingTask, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export { getDocument, PasswordException, type PDFDocumentLoadingTask, type PDFDocumentProxy };
