import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "../lib/cn";
import { clampNotesWidth, NOTES_DEFAULT_WIDTH, NOTES_KEY_STEP, type NotesWidthBounds } from "./notes-width";

interface Drag {
  readonly pointerId: number;
  readonly startX: number;
  readonly startWidth: number;
  /** The width after the latest move. Undefined until the pointer moves, so a plain click stores nothing. */
  latest?: number;
}

/**
 * The edge between the PDF and the notes. At rest it is only the panel's existing hairline divider. Hover shows a
 * neutral grip. Holding the edge, or keyboard focus, adds the accent line and turns the grip to the accent, which is
 * what shows where the focus is, so the focus ring is not drawn.
 */
export function NotesResizeHandle({
  panelId,
  width,
  bounds,
  dragging,
  onDraggingChange,
  onResize,
  onResizeEnd,
}: {
  /** The id of the notes panel this edge sizes. */
  readonly panelId: string;
  readonly width: number;
  readonly bounds: NotesWidthBounds;
  readonly dragging: boolean;
  readonly onDraggingChange: (dragging: boolean) => void;
  /** Called on every change, so the PDF refits while the edge moves. */
  readonly onResize: (width: number) => void;
  /** Called once a change is final, so the width is stored once per gesture rather than on every move. */
  readonly onResizeEnd: (width: number) => void;
}) {
  const drag = useRef<Drag | undefined>(undefined);

  function change(next: number) {
    const clamped = clampNotesWidth(next, bounds);
    onResize(clamped);
    onResizeEnd(clamped);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDraggingChange(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;
    // The notes sit to the right of the edge, so moving the edge left makes them wider.
    const next = clampNotesWidth(current.startWidth + current.startX - event.clientX, bounds);
    current.latest = next;
    onResize(next);
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;
    drag.current = undefined;
    onDraggingChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (current.latest !== undefined) onResizeEnd(current.latest);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      // Moving the edge left gives the notes more room, as dragging it left does.
      case "ArrowLeft":
        next = width + NOTES_KEY_STEP;
        break;
      case "ArrowRight":
        next = width - NOTES_KEY_STEP;
        break;
      case "Home":
        next = bounds.min;
        break;
      case "End":
        next = bounds.max;
        break;
      default:
        return;
    }
    event.preventDefault();
    change(next);
  }

  const fade = "motion-safe:transition-[opacity,background-color] motion-safe:duration-150 motion-safe:ease-out";

  return (
    <div className="relative w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize notes"
        aria-controls={panelId}
        aria-valuenow={width}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        aria-valuetext={`Notes ${width} pixels wide`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => change(NOTES_DEFAULT_WIDTH)}
        className="group absolute inset-y-0 -left-1 z-10 w-2 touch-none cursor-col-resize select-none outline-none"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-accent/60",
            fade,
            dragging ? "opacity-100" : "opacity-0 group-focus-visible:opacity-100",
          )}
        />
        <span
          aria-hidden
          className={cn(
            "absolute top-1/2 left-1/2 h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full",
            fade,
            dragging
              ? "bg-accent opacity-100"
              : "bg-foreground/30 opacity-0 group-hover:opacity-100 group-focus-visible:bg-accent group-focus-visible:opacity-100",
          )}
        />
      </div>
    </div>
  );
}
