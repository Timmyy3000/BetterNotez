import type { PageRect } from "@betternotez/core";
import { Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { cn } from "../lib/cn";
import { anchorOf, popoverBelow } from "./highlight";
import { ColorSwatch, Divider, IconToggle, INK_COLORS } from "./Toolbar";

/** The gap between the popover and the text it points at, and the smallest gap to the page's edge. */
const GAP_PX = 10;
const EDGE_PX = 8;

/**
 * A small strip of highlight colours that opens beside a selection or a clicked highlight. The colours
 * live here rather than in the tool panel, which stays minimal. With `onDelete`, it also removes the highlight.
 */
export function HighlightPopover({
  rects,
  pageWidth,
  pageHeight,
  color,
  onPick,
  onDelete,
}: {
  /** The boxes the popover points at, in page fractions. */
  readonly rects: readonly PageRect[];
  /** Size of the page on screen, in CSS pixels. */
  readonly pageWidth: number;
  readonly pageHeight: number;
  /** The colour the highlight has now, shown as pressed. Absent while the colour is still being chosen. */
  readonly color?: string;
  readonly onPick: (color: string) => void;
  readonly onDelete?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const anchor = anchorOf(rects);
  const deletable = onDelete !== undefined;
  const [place, setPlace] = useState<{ readonly left: number; readonly top: number }>();

  // The popover is measured once it is in the page, then moved to sit above or below its anchor, inside the page.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const { offsetWidth: width, offsetHeight: height } = element;
    const centre = anchor.x * pageWidth;
    const left = clamp(centre - width / 2, EDGE_PX, pageWidth - width - EDGE_PX);
    const top = popoverBelow(anchor, pageHeight)
      ? anchor.bottom * pageHeight + GAP_PX
      : anchor.top * pageHeight - height - GAP_PX;
    setPlace({ left, top: clamp(top, EDGE_PX, pageHeight - height - EDGE_PX) });
  }, [anchor.x, anchor.top, anchor.bottom, pageWidth, pageHeight, deletable]);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Highlight color"
      // A press on a swatch is for the popover alone. Left to bubble, the page would clear the selection it is for.
      onPointerDown={(event: PointerEvent) => event.stopPropagation()}
      onMouseDown={(event: MouseEvent) => event.preventDefault()}
      className={cn(
        "raised-edge absolute z-10 flex items-center gap-0.5 rounded-md border border-border bg-raised p-[5px] shadow-(--lift) animate-[fade-in_160ms_ease-out]",
        place === undefined && "invisible",
      )}
      style={{ left: place?.left ?? 0, top: place?.top ?? 0 }}
    >
      {INK_COLORS.map((swatch) => (
        <ColorSwatch
          key={swatch.value}
          label={`Highlight in ${swatch.name}`}
          value={swatch.value}
          pressed={color === swatch.value}
          onClick={() => onPick(swatch.value)}
        />
      ))}
      {onDelete !== undefined && (
        <>
          <Divider />
          <IconToggle label="Delete highlight" onClick={onDelete}>
            <Trash2 />
          </IconToggle>
        </>
      )}
    </div>
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}
