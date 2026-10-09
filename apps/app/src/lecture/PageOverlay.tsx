import { AnnotationId, newId, type Highlight, type Ink, type TextBox } from "@betternotez/core";
import { useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { cn } from "../lib/cn";
import { commitHighlights } from "./annotation-store";
import { useEditor } from "./editor";
import { distanceToPolyline, strokePath, type StrokePoint } from "./ink";
import { type Command } from "./history";
import { HIGHLIGHT_OPACITY, highlightAt } from "./highlight";
import { HighlightPopover } from "./HighlightPopover";
import { TextBoxView } from "./TextBox";

const ERASER_RADIUS_PX = 10;
/** A touch this soon after pen contact is the palm resting on the screen. */
const PALM_WINDOW_MS = 1500;
const HIGHLIGHTER_WIDTH = 4;
const NEW_TEXT_BOX = { width: 0.28, height: 0.07, fontSize: 14 } as const;

let lastPenAt = Number.NEGATIVE_INFINITY;

type Point = [number, number, number];

type Gesture =
  | { readonly kind: "draw"; readonly pointerId: number; readonly points: Point[]; readonly highlighter: boolean }
  | { readonly kind: "erase"; readonly pointerId: number; readonly removed: Ink[] }
  | { readonly kind: "pan"; readonly pointerId: number; x: number; y: number };

export function PageOverlay({
  pageNumber,
  width,
  height,
  scale,
  children,
}: {
  readonly pageNumber: number;
  /** Size of the page on screen, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** CSS pixels per PDF point. Font sizes and stroke widths are stored in points. */
  readonly scale: number;
  /** Drawn beneath the annotations, so text boxes and strokes stay on top of the page's text. */
  readonly children?: ReactNode;
}) {
  const { store, tool, color, size, editing, selectedId, pendingText, select, beginEdit, scrollRef } = useEditor();
  const onPage = useStore(
    store,
    useShallow((state) => state.annotations.filter((annotation) => annotation.page === pageNumber)),
  );
  const gesture = useRef<Gesture | undefined>(undefined);
  const [draft, setDraft] = useState<readonly Point[]>();
  const [erased, setErased] = useState<readonly string[]>([]);
  const [hovered, setHovered] = useState<string>();

  const drawing = tool === "pen" || tool === "highlighter";
  const erasing = tool === "eraser";
  const inks = useMemo(
    () => onPage.filter((annotation): annotation is Ink => annotation.kind === "ink" && !erased.includes(annotation.id)),
    [onPage, erased],
  );
  const texts = onPage.filter((annotation): annotation is TextBox => annotation.kind === "text");
  const highlights = onPage.filter((annotation): annotation is Highlight => annotation.kind === "highlight");
  const hoveredAi = inks.find((ink) => ink.id === hovered && ink.author === "ai");
  // The popover for a selection points at its last piece, which sits on the page the selection ends on.
  const pendingPiece = pendingText?.at(-1);
  const selectedHighlight = tool === "select" ? highlights.find((highlight) => highlight.id === selectedId) : undefined;

  function highlightPendingText(picked: string) {
    if (pendingText !== undefined) commitHighlights(store, pendingText, picked);
    window.getSelection()?.removeAllRanges();
  }

  function recolorHighlight(highlight: Highlight, picked: string) {
    if (highlight.color === picked) return;
    store.getState().apply([{ type: "put", next: { ...highlight, color: picked }, prev: highlight }], { record: true });
  }

  function removeHighlight(highlight: Highlight) {
    store.getState().apply([{ type: "delete", prev: highlight }], { record: true });
    select(undefined);
  }

  // A click on text, or on the page between runs of text, selects the highlight under it. Clicks on a
  // text box or a stroke belong to that annotation, so they are ignored here.
  function selectHighlightAt(event: MouseEvent<HTMLDivElement>) {
    if (tool !== "select" || highlights.length === 0) return;
    if (event.target !== event.currentTarget && !isOnText(event.target)) return;
    if (window.getSelection()?.isCollapsed === false) return;
    const box = event.currentTarget.getBoundingClientRect();
    const hit = highlightAt(highlights, (event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
    if (hit !== undefined) select(hit.id);
  }
  const draftWidth = tool === "highlighter" ? size * HIGHLIGHTER_WIDTH : size;

  function eraseAt(current: Extract<Gesture, { kind: "erase" }>, rect: DOMRect, sample: PointerEvent | ReactPointerEvent) {
    const [u, v] = unitPoint(rect, sample.clientX, sample.clientY);
    const x = u * width;
    const y = v * height;
    const hits = inks.filter(
      (ink) =>
        !current.removed.some((removed) => removed.id === ink.id) &&
        distanceToPolyline(toPixels(ink.points, width, height), x, y) <= ERASER_RADIUS_PX + (ink.size * scale) / 2,
    );
    if (hits.length > 0) {
      current.removed.push(...hits);
      setErased(current.removed.map((ink) => ink.id));
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    if (gesture.current !== undefined) return;
    if (event.pointerType === "pen") lastPenAt = performance.now();
    if ((drawing || erasing) && isPalm(event.pointerType)) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const [u, v] = unitPoint(rect, event.clientX, event.clientY);
    const capture = () => event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "select") {
      select(undefined);
      // A mouse drag on text selects it, so only a drag on the bare page scrolls.
      if (event.pointerType === "mouse" && !isOnText(event.target)) {
        gesture.current = { kind: "pan", pointerId: event.pointerId, x: event.clientX, y: event.clientY };
        capture();
      }
      return;
    }
    if (tool === "text") {
      const box: TextBox = {
        id: AnnotationId.parse(newId()),
        kind: "text",
        page: pageNumber,
        author: "user",
        x: Math.min(u, 1 - NEW_TEXT_BOX.width),
        y: Math.min(v, 1 - NEW_TEXT_BOX.height),
        width: NEW_TEXT_BOX.width,
        height: NEW_TEXT_BOX.height,
        text: "",
        fontSize: NEW_TEXT_BOX.fontSize,
        color,
      };
      store.getState().preview([{ type: "put", next: box }]);
      select(box.id);
      beginEdit({ id: box.id });
      return;
    }
    if (drawing) {
      const points: Point[] = [[u, v, pressureOf(event)]];
      gesture.current = { kind: "draw", pointerId: event.pointerId, points, highlighter: tool === "highlighter" };
      store.getState().beginInteraction();
      setDraft(points);
      capture();
      return;
    }
    if (erasing) {
      const current: Extract<Gesture, { kind: "erase" }> = { kind: "erase", pointerId: event.pointerId, removed: [] };
      gesture.current = current;
      store.getState().beginInteraction();
      eraseAt(current, rect, event);
      capture();
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "pen") lastPenAt = performance.now();
    const current = gesture.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;

    if (current.kind === "pan") {
      scrollRef.current?.scrollBy(current.x - event.clientX, current.y - event.clientY);
      current.x = event.clientX;
      current.y = event.clientY;
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const samples = coalesced(event);
    if (current.kind === "draw") {
      for (const sample of samples) {
        const [u, v] = unitPoint(rect, sample.clientX, sample.clientY);
        current.points.push([u, v, pressureOf(sample)]);
      }
      setDraft([...current.points]);
      return;
    }
    for (const sample of samples) {
      eraseAt(current, rect, sample);
    }
  }

  function finishGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (current.kind === "draw") {
      setDraft(undefined);
      store.getState().endInteraction();
      const ink: Ink = {
        id: AnnotationId.parse(newId()),
        kind: "ink",
        page: pageNumber,
        author: "user",
        points: current.points.map(([x, y, pressure]) => [x, y, pressure]),
        color,
        size: current.highlighter ? size * HIGHLIGHTER_WIDTH : size,
        ...(current.highlighter ? { opacity: HIGHLIGHT_OPACITY } : {}),
      };
      store.getState().apply([{ type: "put", next: ink }], { record: true });
    } else if (current.kind === "erase") {
      setErased([]);
      store.getState().endInteraction();
      if (current.removed.length > 0) {
        const step: Command[] = current.removed.map((prev) => ({ type: "delete", prev }));
        store.getState().apply(step, { record: true });
      }
    }
  }

  return (
    <div
      className={cn(
        "absolute inset-0",
        (drawing || erasing) && "touch-none",
        drawing && "cursor-crosshair",
        erasing && "cursor-cell",
        tool === "text" && "cursor-text",
      )}
      onMouseDown={(event) => {
        // Focus moving to the page would blur the box that a text click has just created.
        if (tool === "text" && event.target === event.currentTarget) event.preventDefault();
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishGesture}
      onPointerCancel={finishGesture}
      onClick={selectHighlightAt}
    >
      {highlights.flatMap((highlight) =>
        highlight.rects.map((rect, index) => (
          <span
            key={`${highlight.id}-${index}`}
            data-kind="highlight"
            aria-hidden
            className={cn(
              "pointer-events-none absolute rounded-[2px] mix-blend-multiply",
              tool === "select" && selectedId === highlight.id && "shadow-[0_0_0_1px_var(--accent)]",
            )}
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              backgroundColor: highlight.color,
              opacity: HIGHLIGHT_OPACITY,
            }}
          />
        )),
      )}
      {children}
      <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden>
        {inks.map((ink) => (
          <path
            key={ink.id}
            data-kind="ink"
            data-author={ink.author}
            d={strokePath(toPixels(ink.points, width, height), ink.size * scale)}
            fill={ink.color}
            opacity={ink.opacity}
            className={cn(
              tool === "select" || tool === "eraser" ? "pointer-events-auto" : "pointer-events-none",
              // A translucent stroke is the highlighter's. It multiplies onto the page, as a text highlight does.
              ink.opacity !== undefined && "mix-blend-multiply",
            )}
            onPointerEnter={() => setHovered(ink.id)}
            onPointerLeave={() => setHovered(undefined)}
          />
        ))}
        {draft !== undefined && (
          <path
            d={strokePath(toPixels(draft, width, height), draftWidth * scale)}
            fill={color}
            opacity={tool === "highlighter" ? HIGHLIGHT_OPACITY : undefined}
            className={tool === "highlighter" ? "mix-blend-multiply" : undefined}
          />
        )}
      </svg>

      {texts.map(
        (box) =>
          (box.text !== "" || editing?.id === box.id) && (
            <TextBoxView key={box.id} box={box} scale={scale} width={width} height={height} />
          ),
      )}

      {hoveredAi !== undefined && (
        <span
          className="pointer-events-none absolute -translate-y-full rounded bg-accent px-1 text-[10px] leading-4 font-semibold text-accent-foreground"
          style={{ left: (hoveredAi.points[0]?.[0] ?? 0) * width, top: (hoveredAi.points[0]?.[1] ?? 0) * height }}
        >
          AI
        </span>
      )}

      {pendingPiece?.page === pageNumber && (
        <HighlightPopover
          rects={pendingPiece.rects}
          pageWidth={width}
          pageHeight={height}
          onPick={highlightPendingText}
        />
      )}
      {selectedHighlight !== undefined && (
        <HighlightPopover
          rects={selectedHighlight.rects}
          pageWidth={width}
          pageHeight={height}
          color={selectedHighlight.color}
          onPick={(picked) => recolorHighlight(selectedHighlight, picked)}
          onDelete={() => removeHighlight(selectedHighlight)}
        />
      )}
    </div>
  );
}

function unitPoint(rect: DOMRect, x: number, y: number): [number, number] {
  return [clamp01((x - rect.left) / rect.width), clamp01((y - rect.top) / rect.height)];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function pressureOf(event: { readonly pressure: number }): number {
  // Mice and some touch screens report no pressure. A middle value draws an even line.
  return event.pressure > 0 ? clamp01(event.pressure) : 0.5;
}

function isPalm(pointerType: string): boolean {
  return pointerType === "touch" && performance.now() - lastPenAt < PALM_WINDOW_MS;
}

function isOnText(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".textLayer") !== null;
}

function coalesced(event: ReactPointerEvent<HTMLDivElement>): PointerEvent[] {
  const events = event.nativeEvent.getCoalescedEvents();
  return events.length > 0 ? events : [event.nativeEvent];
}

function toPixels(points: readonly StrokePoint[], width: number, height: number): StrokePoint[] {
  return points.map(([x, y, pressure]) => [x * width, y * height, pressure]);
}
