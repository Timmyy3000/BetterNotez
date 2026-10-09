import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { TextLayer } from "../pdf/pdfjs";
import { useEditor } from "./editor";
import { useNearViewport } from "./use-near-viewport";

/**
 * The page's text, laid over the page so it can be selected. pdf.js puts each run of text in a
 * transparent span at its place on the page. The spans take the pointer only with the select tool,
 * so pen and eraser strokes reach the page underneath.
 */
export function PageText({
  doc,
  pageNumber,
  width,
  scale,
  scrollRef,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  /** Width of the page on screen, in CSS pixels. The text is laid out again when it changes. */
  readonly width: number;
  /** CSS pixels per PDF point. pdf.js sizes the spans from it through --total-scale-factor. */
  readonly scale: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { tool } = useEditor();
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder, scrollRef);

  useEffect(() => {
    const container = holder.current;
    if (!near || container === null) return;
    let live = true;
    let layer: TextLayer | undefined;

    void doc
      .getPage(pageNumber)
      .then((page) => {
        if (!live) return;
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / base.width });
        layer = new TextLayer({ textContentSource: page.streamTextContent(), container, viewport });
        return layer.render();
      })
      .catch((error: unknown) => {
        // Scrolling away or zooming cancels a layout on purpose. Only a real failure is worth reporting.
        if (live) console.error(`Page ${pageNumber} text could not be laid out`, error);
      });

    return () => {
      live = false;
      layer?.cancel();
      // The spans belong to pdf.js, not React, so they are removed here rather than by a re-render.
      container.replaceChildren();
    };
  }, [near, doc, pageNumber, width]);

  // The variables are the ones the pdf.js viewer sets on each page. Its own stylesheet is not loaded, so they are set here.
  const variables = {
    "--total-scale-factor": scale,
    "--user-unit": 1,
    "--scale-round-x": "1px",
    "--scale-round-y": "1px",
  } as CSSProperties;

  return (
    <div
      ref={holder}
      style={variables}
      className={tool === "select" ? "textLayer pointer-events-none [&_span]:pointer-events-auto" : "textLayer pointer-events-none"}
    />
  );
}
