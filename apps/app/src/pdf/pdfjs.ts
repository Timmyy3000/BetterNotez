import {
  GlobalWorkerOptions,
  getDocument,
  PasswordException,
  TextLayer,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export { getDocument, PasswordException, TextLayer, type PDFDocumentLoadingTask, type PDFDocumentProxy };
