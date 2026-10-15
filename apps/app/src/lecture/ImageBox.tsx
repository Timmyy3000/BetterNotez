import type { ImageBox as ImageBoxModel } from "@betternotez/core";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../lib/cn";
import { useEditor } from "./editor";
import { sameAnnotation } from "./history";

const DRAG_SLOP_PX = 3;
const MIN_WIDTH = 0.04;

type Geometry = Pick<ImageBoxModel, "x" | "y" | "width" | "height">;

interface Gesture {
  readonly kind: "move" | "resize";
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly origin: ImageBoxModel;
  moved: boolean;
  geometry: Geometry;
}

/** A picture on the page. The select tool moves it, and its corner handle resizes it without changing its shape. */
export function ImageBoxView({
  box,
  width,
  height,
}: {
  readonly box: ImageBoxModel;
  readonly width: number;
  readonly height: number;
}) {
  const { store, tool, selectedId, select, images } = useEditor();
  const isSelected = selectedId === box.id;
  const gesture = useRef<Gesture | undefined>(undefined);
  const [moving, setMoving] = useState<Geometry>();
  const [src, setSrc] = useState<string>();
  const shown = moving ?? box;

  useEffect(() => {
    let live = true;
    images.url(box.image).then(
      (url) => {
        if (live) setSrc(url);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [images, box.image]);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.stopPropagation();
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
    current.geometry =
      current.kind === "move"
        ? {
            x: clamp(origin.x + deltaX / width, 0, 1 - origin.width),
            y: clamp(origin.y + deltaY / height, 0, 1 - origin.height),
            width: origin.width,
            height: origin.height,
          }
        : resized(origin, deltaX / width);
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
    if (!commit || !current.moved) return;
    const next: ImageBoxModel = { ...current.origin, ...current.geometry };
    if (!sameAnnotation(next, current.origin)) {
      store.getState().apply([{ type: "put", next, prev: current.origin }], { record: true });
    }
  }

  return (
    <div
      data-kind="image"
      data-author={box.author}
      className={cn(
        "absolute touch-none select-none",
        tool === "select" ? "pointer-events-auto cursor-move" : "pointer-events-none",
        isSelected && "outline outline-1 outline-accent",
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
      {src !== undefined && <img src={src} alt="" draggable={false} className="size-full" />}
      {isSelected && (
        <span
          data-handle="resize"
          className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-accent bg-sheet"
        />
      )}
    </div>
  );
}

/** The box made `dx` wider, page widths, keeping its shape and staying on the page. */
function resized(origin: Geometry, dx: number): Geometry {
  const shape = origin.height / origin.width;
  let next = clamp(origin.width + dx, MIN_WIDTH, 1 - origin.x);
  if (next * shape > 1 - origin.y) next = (1 - origin.y) / shape;
  return { x: origin.x, y: origin.y, width: next, height: next * shape };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
