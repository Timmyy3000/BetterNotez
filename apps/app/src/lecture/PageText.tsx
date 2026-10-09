import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
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
  /** Width of the page on screen, in CSS pixels. The spans are laid out again at a new width, not rebuilt. */
  readonly width: number;
  /** CSS pixels per PDF point. pdf.js sizes the spans from it through --total-scale-factor. */
  readonly scale: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const { tool } = useEditor();
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder, scrollRef);
  // The width the spans are laid out at. It is kept current, so a layer that finishes after a resize lands at the new width.
  const widthRef = useRef(width);
  // The layer once it is drawn, and the page it was drawn from. A width change re-lays it out in place.
  const layout = useRef<{ readonly page: PDFPageProxy; readonly layer: TextLayer; ready: boolean }>(undefined);

  useEffect(() => {
    const container = holder.current;
    if (!near || container === null) return;
    let live = true;

    void doc
      .getPage(pageNumber)
      .then((page) => {
        if (!live) return;
        const layer = new TextLayer({
          textContentSource: page.streamTextContent(),
          container,
          viewport: viewportAt(page, widthRef.current),
        });
        layout.current = { page, layer, ready: false };
        return layer.render().then(() => {
          if (live && layout.current?.layer === layer) layout.current.ready = true;
        });
      })
      .catch((error: unknown) => {
        // Scrolling away cancels a layout on purpose. Only a real failure is worth reporting.
        if (live) console.error(`Page ${pageNumber} text could not be laid out`, error);
      });

    return () => {
      live = false;
      layout.current?.layer.cancel();
      layout.current = undefined;
      // The spans belong to pdf.js, not React, so they are removed here rather than by a re-render.
      container.replaceChildren();
    };
  }, [near, doc, pageNumber]);

  // A new width moves the spans where they are. Rebuilding them would drop a selection made in them, and a
  // notes drag changes the width on every frame.
  useEffect(() => {
    widthRef.current = width;
    const current = layout.current;
    if (current?.ready === true) current.layer.update({ viewport: viewportAt(current.page, width) });
  }, [width]);

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

/** The page at a width in CSS pixels. pdf.js lays a text layer out at this viewport. */
function viewportAt(page: PDFPageProxy, width: number) {
  const base = page.getViewport({ scale: 1 });
  return page.getViewport({ scale: width / base.width });
}
