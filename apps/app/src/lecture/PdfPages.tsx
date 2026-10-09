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

/** Space above the first page, under the floating toolbar. */
const PAGE_TOP = 80;
const PAGE_GAP = 16;
const GUTTER = 56;
/** Caps the canvas size so zooming in on a large page does not exhaust memory. */
const MAX_CANVAS_PIXELS = 16_000_000;
/** A page is redrawn once its size has held this long. Until then it is stretched, which keeps a drag responsive. */
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
  onPageChange,
}: {
  readonly ref?: Ref<PdfPagesHandle>;
  readonly doc: PDFDocumentProxy;
  readonly zoom: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /** The page to show when the viewer opens. */
  readonly startPage: number;
  readonly onPageChange: (page: number) => void;
}) {
  const [geometries, setGeometries] = useState<readonly PageGeometry[]>();
  const [viewportWidth, setViewportWidth] = useState(0);
  // The page at the top of the view. It stays at the top when the page size changes.
  const anchor = useRef(startPage);
  const pageWidth = Math.max(0, viewportWidth - 2 * GUTTER) * zoom;

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
  scrollRef,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly geometry: PageGeometry;
  readonly width: number;
  readonly height: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      data-page-number={pageNumber}
      aria-label={`Page ${pageNumber}`}
      className="pdf-sheet relative shrink-0"
      style={{ width, height }}
    >
      <PdfCanvas doc={doc} pageNumber={pageNumber} width={width} height={height} scrollRef={scrollRef} />
      <PageOverlay pageNumber={pageNumber} width={width} height={height} scale={width / displaySize(geometry).width} />
    </section>
  );
});

/** Draws a page only while it is near the viewport. Off-screen pages keep their space and drop their pixels. */
function PdfCanvas({
  doc,
  pageNumber,
  width,
  height,
  scrollRef,
}: {
  readonly doc: PDFDocumentProxy;
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const near = useNearViewport(holder, scrollRef);
  const canvas = useRef<HTMLCanvasElement>(null);
  // The canvas is sized by its section, so it stretches to each new width at once. Only the drawing waits.
  const drawWidth = useSettled(width, REDRAW_SETTLE_MS);
  const drawHeight = useSettled(height, REDRAW_SETTLE_MS);

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
        const resolution = Math.min(
          window.devicePixelRatio || 1,
          Math.sqrt(MAX_CANVAS_PIXELS / (drawWidth * drawHeight)),
        );
        const viewport = page.getViewport({ scale: cssScale * resolution });
        element.width = Math.floor(viewport.width);
        element.height = Math.floor(viewport.height);
        task = page.render({ canvas: element, canvasContext: context, viewport, intent: "display" });
        return task.promise;
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
  }, [near, doc, pageNumber, drawWidth, drawHeight]);

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

function useNearViewport(target: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const element = target.current;
    if (element === null) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root: root.current, rootMargin: "100% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [target, root]);
  return near;
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
