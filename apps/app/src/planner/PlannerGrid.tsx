import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { cn } from "../lib/cn";
import {
  DAY_NAMES,
  HOUR_PX,
  isArrowKey,
  keyStep,
  laneStyle,
  layoutOverlaps,
  minutesToPx,
  newBlock,
  placeEnd,
  placeStart,
  pxToMinutes,
  toTime,
  type ArrowKey,
  type Span,
} from "./time";

export interface Placement {
  readonly day: number;
  readonly start: number;
  readonly end: number;
}

export interface PlannerBlock extends Placement {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly location?: string;
}

interface PlannerGridProps {
  /** Day indexes to show, Monday first. */
  readonly days: readonly number[];
  readonly blocks: readonly PlannerBlock[];
  readonly range: Span;
  readonly onCreate: (placement: Placement) => void;
  readonly onOpen: (id: string) => void;
  /** Called on every move or resize step with `commit` false, and once more on release with `commit` true. */
  readonly onChange: (id: string, placement: Placement, commit: boolean) => void;
}

const WEEKEND_FIRST_DAY = 5;

export function PlannerGrid({ days, blocks, range, onCreate, onOpen, onChange }: PlannerGridProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // A pointer drag ends with a click on the block it started from. Opening the editor there would be wrong.
  const justDragged = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  // A block moved to another day is remounted in that column, so focus is put back on it after the render.
  const refocus = useRef<string | null>(null);
  const height = minutesToPx(range.end, range.start);
  const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, index) => range.start + index * 60);
  const todayIndex = (new Date().getDay() + 6) % 7;

  useEffect(() => {
    const id = refocus.current;
    if (id === null) return;
    refocus.current = null;
    const moved = [...(grid.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [])].find(
      (element) => element.dataset.blockId === id,
    );
    moved?.focus();
  });

  function nudge(block: PlannerBlock, key: ArrowKey, shift: boolean) {
    const next = keyStep(block, key, shift, days, range);
    if (next.day === block.day && next.start === block.start && next.end === block.end) return;
    refocus.current = block.id;
    onChange(block.id, next, true);
  }

  function handleDragEnd({ active, over, delta }: DragEndEvent) {
    justDragged.current = true;
    window.setTimeout(() => {
      justDragged.current = false;
    }, 0);

    const block = blocks.find((item) => item.id === active.id);
    if (block === undefined) return;
    const overDay = over?.data.current?.day;
    const day = typeof overDay === "number" ? overDay : block.day;
    const duration = block.end - block.start;
    const start = placeStart(block.start + pxToMinutes(delta.y), duration, range);
    if (day === block.day && start === block.start) return;
    onChange(block.id, { day, start, end: start + duration }, true);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        ref={grid}
        className="grid"
        style={{ gridTemplateColumns: `3.5rem ${days.map((day) => (day >= WEEKEND_FIRST_DAY ? "0.6fr" : "1fr")).join(" ")}` }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day}
            className={cn(
              "mb-2 border-b border-rule-strong pb-1.5 text-center font-serif text-xl text-muted-foreground italic",
              day === todayIndex && "border-accent text-accent",
            )}
          >
            {DAY_NAMES[day]?.slice(0, 3)}
          </div>
        ))}

        <div className="relative" style={{ height }}>
          {hours.map((minutes) => (
            <span
              key={minutes}
              className="absolute right-2 -translate-y-1/2 text-xs text-muted-foreground tabular-nums"
              style={{ top: minutesToPx(minutes, range.start) }}
            >
              {toTime(minutes)}
            </span>
          ))}
        </div>

        {days.map((day) => (
          <DayColumn
            key={day}
            day={day}
            height={height}
            range={range}
            blocks={blocks.filter((block) => block.day === day)}
            onCreate={onCreate}
            onOpen={(id) => {
              if (!justDragged.current) onOpen(id);
            }}
            onChange={onChange}
            onNudge={nudge}
          />
        ))}
      </div>
    </DndContext>
  );
}

function DayColumn({
  day,
  height,
  range,
  blocks,
  onCreate,
  onOpen,
  onChange,
  onNudge,
}: {
  readonly day: number;
  readonly height: number;
  readonly range: Span;
  readonly blocks: readonly PlannerBlock[];
  readonly onCreate: (placement: Placement) => void;
  readonly onOpen: (id: string) => void;
  readonly onChange: PlannerGridProps["onChange"];
  readonly onNudge: (block: PlannerBlock, key: ArrowKey, shift: boolean) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `day-${day}`, data: { day } });
  const [draft, setDraft] = useState<{ anchor: number; current: number } | null>(null);
  const preview = draft === null ? null : newBlock(draft.anchor, draft.current, range);

  function minuteAt(event: PointerEvent<HTMLDivElement>): number {
    return range.start + pxToMinutes(event.clientY - event.currentTarget.getBoundingClientRect().top);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("[data-block]"))) return;
    const minute = minuteAt(event);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ anchor: minute, current: minute });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (draft === null) return;
    setDraft({ ...draft, current: minuteAt(event) });
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (draft === null) return;
    const span = newBlock(draft.anchor, minuteAt(event), range);
    setDraft(null);
    onCreate({ day, ...span });
  }

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={DAY_NAMES[day]}
      className="relative border-l border-border/70"
      style={{
        height,
        backgroundImage: "linear-gradient(to bottom, var(--ruled) 1px, transparent 1px)",
        backgroundSize: `100% ${HOUR_PX}px`,
        touchAction: "none",
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDraft(null)}
    >
      {preview !== null && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-1 rounded-lg border-2 border-dashed border-accent bg-accent-soft/60"
          style={{
            top: minutesToPx(preview.start, range.start),
            height: minutesToPx(preview.end, preview.start),
          }}
        />
      )}
      {layoutOverlaps(blocks).map(({ item, column, columns }) => (
        <BlockView
          key={item.id}
          block={item}
          lane={column}
          lanes={columns}
          range={range}
          onOpen={onOpen}
          onChange={onChange}
          onNudge={onNudge}
        />
      ))}
    </div>
  );
}

/** Above every lane, so a card being dragged stays on top of the cards it crosses. */
const DRAGGING_Z = 1000;

function BlockView({
  block,
  lane,
  lanes,
  range,
  onOpen,
  onChange,
  onNudge,
}: {
  readonly block: PlannerBlock;
  readonly lane: number;
  readonly lanes: number;
  readonly range: Span;
  readonly onOpen: (id: string) => void;
  readonly onChange: PlannerGridProps["onChange"];
  readonly onNudge: (block: PlannerBlock, key: ArrowKey, shift: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: block.id });
  const top = minutesToPx(block.start, range.start);
  const height = minutesToPx(block.end, block.start);
  const time = `${toTime(block.start)}–${toTime(block.end)}`;
  const label = [block.name, time, block.location].filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      data-block
      data-block-id={block.id}
      {...attributes}
      {...listeners}
      aria-label={label.join(", ")}
      title={label.join("\n")}
      onClick={() => onOpen(block.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          onOpen(block.id);
        } else if (isArrowKey(event.key)) {
          // Arrow keys move a focused block, the keyboard form of a drag. Shift changes its end time.
          event.preventDefault();
          onNudge(block, event.key, event.shiftKey);
        }
      }}
      className={cn(
        "absolute overflow-hidden rounded-sm border-l-[3px] bg-raised px-2.5 py-2 text-xs leading-snug ring-1 ring-inset ring-rule shadow-[0_1px_0_var(--rule)] transition-shadow duration-200 cursor-grab hover:shadow-[0_8px_16px_-10px_rgb(0_0_0_/_0.6)] active:cursor-grabbing",
        isDragging && "shadow-[0_14px_24px_-12px_rgb(0_0_0_/_0.7)]",
      )}
      style={{
        top,
        height,
        ...laneStyle(lane, lanes),
        zIndex: isDragging ? DRAGGING_Z : lane,
        borderColor: block.color,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div className="@container h-full min-w-0">
        <p className="truncate text-[13px] font-medium">{block.name}</p>
        {height >= 44 && <p className="truncate text-muted-foreground">{time}</p>}
        {height >= 62 && block.location !== undefined && (
          <p className="hidden truncate text-muted-foreground @[7rem]:block">{block.location}</p>
        )}
      </div>
      <ResizeHandle block={block} range={range} onChange={onChange} />
    </div>
  );
}

function ResizeHandle({
  block,
  range,
  onChange,
}: {
  readonly block: PlannerBlock;
  readonly range: Span;
  readonly onChange: PlannerGridProps["onChange"];
}) {
  const drag = useRef<{ startY: number; startEnd: number; end: number } | null>(null);

  function finish() {
    const current = drag.current;
    drag.current = null;
    if (current === null || current.end === current.startEnd) return;
    onChange(block.id, { day: block.day, start: block.start, end: current.end }, true);
  }

  return (
    <div
      aria-hidden
      className="group absolute inset-x-0 bottom-0 flex h-3 cursor-ns-resize items-center justify-center"
      onPointerDown={(event) => {
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startY: event.clientY, startEnd: block.end, end: block.end };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (current === null) return;
        const end = placeEnd(block.start, current.startEnd + pxToMinutes(event.clientY - current.startY), range);
        if (end === current.end) return;
        current.end = end;
        onChange(block.id, { day: block.day, start: block.start, end }, false);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="h-0.5 w-6 rounded-full bg-foreground/25 opacity-0 transition-opacity group-hover:opacity-100" />
    </div>
  );
}
