import type { TextBox as TextBoxModel } from "@betternotez/core";
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../lib/cn";
import { useEditor } from "./editor";
import { sameAnnotation } from "./history";
import { LINE_HEIGHT, TEXT_PADDING_PT } from "./text-layout";

const SAVE_DELAY_MS = 400;
const DRAG_SLOP_PX = 3;
const MIN_WIDTH = 0.05;
const MIN_HEIGHT = 0.03;

type Geometry = Pick<TextBoxModel, "x" | "y" | "width" | "height">;

interface Gesture {
  readonly kind: "move" | "resize";
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly origin: TextBoxModel;
  moved: boolean;
  geometry: Geometry;
}

export function TextBoxView({
  box,
  scale,
  width,
  height,
}: {
  readonly box: TextBoxModel;
  /** CSS pixels per PDF point. */
  readonly scale: number;
  readonly width: number;
  readonly height: number;
}) {
  const { store, tool, selectedId, editing, select, beginEdit, endEdit } = useEditor();
  const isEditing = editing?.id === box.id;
  const isSelected = selectedId === box.id;
  const field = useRef<HTMLTextAreaElement>(null);
  const gesture = useRef<Gesture | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const [moving, setMoving] = useState<Geometry>();
  const shown = moving ?? box;

  useEffect(() => {
    if (isEditing) field.current?.focus();
  }, [isEditing]);

  useEffect(
    () => () => {
      // Text typed in the last moment still reaches disk when the box unmounts, unless the box is gone.
      if (saveTimer.current === undefined) return;
      window.clearTimeout(saveTimer.current);
      const current = store.getState().annotations.find((annotation) => annotation.id === box.id);
      if (current?.kind === "text" && current.text.trim() !== "") {
        store.getState().apply([{ type: "put", next: current }]);
      }
    },
    [store, box.id],
  );

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    // Pointer events inside the box stay here, so the page below does not start a gesture of its own.
    event.stopPropagation();
    if (isEditing && event.target === field.current) return;
    const onHandle = event.target instanceof HTMLElement && event.target.dataset.handle === "resize";
    select(box.id);
    gesture.current = {
      kind: onHandle ? "resize" : "move",
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: box,
      moved: false,
      geometry: box,
    };
    store.getState().beginInteraction();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (!current.moved && Math.hypot(deltaX, deltaY) < DRAG_SLOP_PX) return;
    current.moved = true;

    const { origin } = current;
    const dx = deltaX / width;
    const dy = deltaY / height;
    current.geometry =
      current.kind === "move"
        ? {
            x: clamp(origin.x + dx, 0, 1 - origin.width),
            y: clamp(origin.y + dy, 0, 1 - origin.height),
            width: origin.width,
            height: origin.height,
          }
        : {
            x: origin.x,
            y: origin.y,
            width: clamp(origin.width + dx, MIN_WIDTH, 1 - origin.x),
            height: clamp(origin.height + dy, MIN_HEIGHT, 1 - origin.y),
          };
    setMoving(current.geometry);
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>, commit: boolean) {
    const current = gesture.current;
    if (current === undefined || current.pointerId !== event.pointerId) return;
    gesture.current = undefined;
    setMoving(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    store.getState().endInteraction();

    if (!commit) return;
    if (!current.moved) {
      if (current.kind === "move") beginEdit({ id: box.id, before: current.origin });
      return;
    }
    const next: TextBoxModel = { ...current.origin, ...current.geometry };
    if (!sameAnnotation(next, current.origin)) {
      store.getState().apply([{ type: "put", next, prev: current.origin }], { record: true });
    }
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const next: TextBoxModel = { ...box, text: event.target.value };
    store.getState().preview([{ type: "put", next }]);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      if (next.text.trim() !== "") {
        store.getState().apply([{ type: "put", next }]);
      }
    }, SAVE_DELAY_MS);
  }

  function finishEditing() {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    endEdit(box.id);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") event.currentTarget.blur();
  }

  const fontPx = box.fontSize * scale;
  return (
    <div
      data-kind="text"
      data-author={box.author}
      className={cn(
        "group absolute rounded-sm border",
        isEditing ? "border-accent bg-surface/80 cursor-text" : "cursor-move touch-none select-none",
        isSelected && !isEditing ? "border-accent" : !isEditing && "border-transparent hover:border-accent/50",
        tool === "select" || tool === "text" ? "pointer-events-auto" : "pointer-events-none",
      )}
      style={{
        left: `${shown.x * 100}%`,
        top: `${shown.y * 100}%`,
        width: `${shown.width * 100}%`,
        height: `${shown.height * 100}%`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => endGesture(event, true)}
      onPointerCancel={(event) => endGesture(event, false)}
    >
      <textarea
        ref={field}
        aria-label="Text box"
        value={box.text}
        readOnly={!isEditing}
        tabIndex={isEditing ? undefined : -1}
        onChange={handleChange}
        onBlur={finishEditing}
        onKeyDown={handleKeyDown}
        className={cn(
          "block size-full resize-none overflow-hidden bg-transparent outline-none",
          isEditing ? "pointer-events-auto" : "pointer-events-none",
        )}
        style={{ padding: TEXT_PADDING_PT * scale, fontSize: fontPx, lineHeight: LINE_HEIGHT, color: box.color }}
      />
      {isSelected && (
        <span
          data-handle="resize"
          className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-accent bg-surface"
        />
      )}
      {box.author === "ai" && (
        <span
          className={cn(
            "pointer-events-none absolute -top-2 -right-2 rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-foreground transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          )}
        >
          AI
        </span>
      )}
    </div>
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
