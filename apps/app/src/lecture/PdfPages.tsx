import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import {
  memo,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
  type RefObject,
  type UIEvent,
} from "react";
import { displaySize, normalizeRotation, pageAtOffset, pageTops, scrollTopForPage, type PageGeometry } from "./geometry";
import { PageOverlay } from "./PageOverlay";
import { PageText } from "./PageText";
import { useNearViewport } from "./use-near-viewport";

/** Space above the first page, under the floating toolbar. */
const PAGE_TOP = 80;
const PAGE_GAP = 16;
const GUTTER = 56;
/** Caps the canvas size so zooming in on a large page does not exhaust memory. */
const MAX_CANVAS_PIXELS = 16_000_000;
/** While the notes edge is held, a page is redrawn once its width has held this long. Until then it is stretched. */
const REDRAW_SETTLE_MS = 150;

export interface PdfPagesHandle {
  readonly goToPage: (page: number) => void;
}

export function PdfPages({
  ref,
  doc,
  zoom,
  scrollRef,
  startPage,
  settleRedraw,
  onPageChange,
}: {
  readonly ref?: Ref<PdfPagesHandle>;
  readonly doc: PDFDocumentProxy;
  readonly zoom: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** The page to show when the viewer opens. */
  readonly startPage: number;
  /** True while the notes edge is held, so the pages redraw once it settles. Zoom and window resizes redraw at once. */
  readonly settleRedraw: boolean;
  readonly onPageChange: (page: number) => void;
}) {
  const [geometries, setGeometries] = useState<readonly PageGeometry[]>();
  const [viewportWidth, setViewportWidth] = useState(0);
  // The page at the top of the view. It stays at the top when the page size changes.
  const anchor = useRef(startPage);
  const pageWidth = Math.max(0, viewportWidth - 2 * GUTTER) * zoom;
  // The sections stretch to each new width at once. Only the drawing waits.
  const drawWidth = useSettled(pageWidth, settleRedraw ? REDRAW_SETTLE_MS : 0);

  useEffect(() => {
    let live = true;
    void readGeometries(doc).then((pages) => {
      if (live) setGeometries(pages);
    });
    return () => {
      live = false;
    };
  }, [doc]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth));
    observer.observe(element);
    setViewportWidth(element.clientWidth);
    return () => observer.disconnect();
  }, [scrollRef]);

  const sizes = useMemo(
    () =>
      (geometries ?? []).map((geometry) => {
        const display = displaySize(geometry);
        return { width: pageWidth, height: (pageWidth * display.height) / display.width };
      }),
    [geometries, pageWidth],
  );
  const tops = useMemo(() => pageTops(sizes.map((size) => size.height), PAGE_TOP, PAGE_GAP), [sizes]);

  function goToPage(page: number) {
    const element = scrollRef.current;
    const top = tops[page - 1];
    if (element === null || top === undefined) return;
    anchor.current = page;
    element.scrollTop = scrollTopForPage(page, top, PAGE_GAP);
    onPageChange(page);
  }

  useImperativeHandle(ref, () => ({ goToPage }));

  useLayoutEffect(() => {
    const top = tops[anchor.current - 1];
    const element = scrollRef.current;
    if (element !== null && top !== undefined) {
      element.scrollTop = scrollTopForPage(anchor.current, top, PAGE_GAP);
    }
  }, [tops, scrollRef]);

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const element = event.currentTarget;
    const page = pageAtOffset(tops, element.scrollTop + element.clientHeight * 0.35) + 1;
    anchor.current = page;
    onPageChange(page);
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="desk absolute inset-0 overflow-auto">
      <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 px-6 pt-20 pb-24">
        {geometries?.map((geometry, index) => {
          const size = sizes[index];
          if (size === undefined) return null;
          return (
            <PageSlot
              key={index + 1}
              doc={doc}
              pageNumber={index + 1}
              geometry={geometry}
              width={size.width}
              height={size.height}
              drawWidth={drawWidth}
              scrollRef={scrollRef}
            />
          );
        })}
      </div>
    </div>
  );
}

const PageSlot = memo(function PageSlot({
  doc,
  pageNumber,
  geometry,
  width,
  height,
  drawWidth,
  scrollRef,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly geometry: PageGeometry;
  readonly width: number;
  readonly height: number;
  readonly drawWidth: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  // CSS pixels per PDF point. Annotation sizes are stored in points, so they scale with the page.
  const scale = width / displaySize(geometry).width;
  return (
    <section
      data-page-number={pageNumber}
      aria-label={`Page ${pageNumber}`}
      className="pdf-sheet relative shrink-0"
      style={{ width, height }}
    >
      <PdfCanvas doc={doc} pageNumber={pageNumber} drawWidth={drawWidth} scrollRef={scrollRef} />
      <PageOverlay pageNumber={pageNumber} width={width} height={height} scale={scale}>
        <PageText doc={doc} pageNumber={pageNumber} width={width} scale={scale} scrollRef={scrollRef} />
      </PageOverlay>
    </section>
  );
});

/** Draws a page only while it is near the viewport. Off-screen pages keep their space and drop their pixels. */
function PdfCanvas({
  doc,
  pageNumber,
  drawWidth,
  scrollRef,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  /** The width the page is drawn at. The canvas is stretched to its section until this catches up. */
  readonly drawWidth: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder, scrollRef);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    if (!near || element === null) return;
    let live = true;
    let task: RenderTask | undefined;

    void doc
      .getPage(pageNumber)
      .then((page) => {
        if (!live) return;
        const context = element.getContext("2d");
        if (context === null) return;
        const base = page.getViewport({ scale: 1 });
        const cssScale = drawWidth / base.width;
        const drawHeight = base.height * cssScale;
        const resolution = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(MAX_CANVAS_PIXELS / (drawWidth * drawHeight)),
        );
        const viewport = page.getViewport({ scale: cssScale * resolution });
        // The new page is drawn off screen and copied over once it is complete, so the stretched page stays visible
        // until then instead of flashing blank.
        const drawn = document.createElement("canvas");
        drawn.width = Math.floor(viewport.width);
        drawn.height = Math.floor(viewport.height);
        const drawnContext = drawn.getContext("2d");
        if (drawnContext === null) return;
        task = page.render({ canvas: drawn, canvasContext: drawnContext, viewport, intent: "display" });
        return task.promise.then(() => {
          if (!live) return;
          element.width = drawn.width;
          element.height = drawn.height;
          context.drawImage(drawn, 0, 0);
        });
      })
      .catch((error: unknown) => {
        // Scrolling away, zooming, or closing the lecture cancels a render on purpose.
        if (live && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          console.error(`Page ${pageNumber} could not be drawn`, error);
        }
      });

    return () => {
      live = false;
      task?.cancel();
    };
  }, [near, doc, pageNumber, drawWidth]);

  return (
    <div ref={holder} className="absolute inset-0">
      {near && <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />}
    </div>
  );
}

/** The value once it has held still for `delay` milliseconds. The first value is returned at once. */
function useSettled(value: number, delay: number): number {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (value === settled) return;
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, settled, delay]);
  return settled;
}

async function readGeometries(doc: PDFDocumentProxy): Promise<PageGeometry[]> {
  const pages: PageGeometry[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const [x0 = 0, y0 = 0, x1 = 612, y1 = 792] = page.view;
    pages.push({ x: x0, y: y0, width: x1 - x0, height: y1 - y0, rotation: normalizeRotation(page.rotate) });
  }
  return pages;
}
