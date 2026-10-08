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
import { useRef, useState, type PointerEvent } from "react";
import { cn } from "../lib/cn";
import {
  DAY_NAMES,
  HOUR_PX,
  laneStyle,
  layoutOverlaps,
  minutesToPx,
  newBlock,
  placeEnd,
  placeStart,
  pxToMinutes,
  toTime,
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
  const height = minutesToPx(range.end, range.start);
  const hours = Array.from({ length: (range.end - range.start) / 60 + 1 }, (_, index) => range.start + index * 60);

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
        className="grid"
        style={{ gridTemplateColumns: `3.5rem ${days.map((day) => (day >= WEEKEND_FIRST_DAY ? "0.6fr" : "1fr")).join(" ")}` }}
      >
        <div />
        {days.map((day) => (
          <div key={day} className="pb-2 text-center text-xs font-medium text-muted-foreground">
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
}: {
  readonly day: number;
  readonly height: number;
  readonly range: Span;
  readonly blocks: readonly PlannerBlock[];
  readonly onCreate: (placement: Placement) => void;
  readonly onOpen: (id: string) => void;
  readonly onChange: PlannerGridProps["onChange"];
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
        backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
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
}: {
  readonly block: PlannerBlock;
  readonly lane: number;
  readonly lanes: number;
  readonly range: Span;
  readonly onOpen: (id: string) => void;
  readonly onChange: PlannerGridProps["onChange"];
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
      {...attributes}
      {...listeners}
      aria-label={label.join(", ")}
      title={label.join("\n")}
      onClick={() => onOpen(block.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen(block.id);
      }}
      className={cn(
        "absolute overflow-hidden rounded-lg border-l-[3px] px-2 py-1.5 text-xs leading-snug shadow-sm outline-none transition-shadow cursor-grab hover:shadow-md focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing",
        isDragging && "shadow-lg",
      )}
      style={{
        top,
        height,
        ...laneStyle(lane, lanes),
        zIndex: isDragging ? DRAGGING_Z : lane,
        borderColor: block.color,
        backgroundColor: `color-mix(in srgb, ${block.color} 16%, var(--surface))`,
        transform: CSS.Translate.toString(transform),
      }}
    >
      <div className="@container h-full min-w-0">
        <p className="truncate font-semibold">{block.name}</p>
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
      className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
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
    />
  );
}
