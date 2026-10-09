const SLOT_MINUTES = 15;
export const HOUR_PX = 52;
const DEFAULT_DURATION = 60;

/** Index 0 is Monday, as in the core planner model. */
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

const DEFAULT_START = 7 * 60;
const DEFAULT_END = 22 * 60;

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface Placed<T extends Span> {
  readonly item: T;
  /** Zero-based lane within the overlap cluster. */
  readonly column: number;
  /** Lanes the overlap cluster uses, so each item takes 1 / columns of the width. */
  readonly columns: number;
}

/** "09:30" to minutes after midnight. */
export function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Minutes after midnight to "09:30". */
export function toTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export function snap(minutes: number): number {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

/** The visible hours: 07:00 to 22:00, widened so that every span stays on the grid. */
export function gridRange(spans: readonly Span[]): Span {
  return spans.reduce(
    (range, span) => ({
      start: Math.min(range.start, Math.floor(span.start / 60) * 60),
      end: Math.max(range.end, Math.ceil(span.end / 60) * 60),
    }),
    { start: DEFAULT_START, end: DEFAULT_END },
  );
}

export function minutesToPx(minutes: number, origin: number): number {
  return ((minutes - origin) / 60) * HOUR_PX;
}

export function pxToMinutes(px: number): number {
  return (px / HOUR_PX) * 60;
}

/** A start on a slot that keeps a block of `duration` minutes inside the grid. */
export function placeStart(start: number, duration: number, range: Span): number {
  return Math.min(Math.max(snap(start), range.start), range.end - duration);
}

/** An end on a slot that is at least one slot after `start` and inside the grid. */
export function placeEnd(start: number, end: number, range: Span): number {
  return Math.min(Math.max(snap(end), start + SLOT_MINUTES), range.end);
}

/**
 * The block made by pressing at `anchor` and releasing at `current`. A press without a drag
 * makes a block of the default duration.
 */
export function newBlock(anchor: number, current: number, range: Span): Span {
  const from = snap(Math.min(anchor, current));
  const to = snap(Math.max(anchor, current));
  const start = Math.min(Math.max(from, range.start), range.end - SLOT_MINUTES);
  const end = to - from >= SLOT_MINUTES ? to : from + DEFAULT_DURATION;
  return { start, end: Math.min(end, range.end) };
}

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

export function isArrowKey(key: string): key is ArrowKey {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/**
 * The placement after one arrow key on a block. Up and down move it a slot, and left and right
 * move it a visible day. With Shift, up and down change its end by a slot instead. A step past the
 * grid or the visible days returns the block unchanged.
 */
export function keyStep(
  block: { readonly day: number; readonly start: number; readonly end: number },
  key: ArrowKey,
  shift: boolean,
  days: readonly number[],
  range: Span,
): { readonly day: number; readonly start: number; readonly end: number } {
  const sign = key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1;
  const { day, start, end } = block;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const index = days.indexOf(day);
    if (shift || index === -1) return { day, start, end };
    const next = days[Math.min(Math.max(index + sign, 0), days.length - 1)];
    return { day: next ?? day, start, end };
  }
  if (shift) return { day, start, end: placeEnd(start, end + sign * SLOT_MINUTES, range) };
  const nextStart = placeStart(start + sign * SLOT_MINUTES, end - start, range);
  return { day, start: nextStart, end: nextStart + (end - start) };
}

/** The narrowest a card may get before overlapping cards start to stack instead of sharing the day. */
export const MIN_CARD_PX = 88;

/**
 * Horizontal position and width of one lane in an overlap cluster, as CSS inside a day column.
 * Cards share the day evenly while each stays at least MIN_CARD_PX wide. Past that, they stack:
 * each lane starts further right, so later lanes cover the earlier ones, and the last card still
 * ends at the day's edge.
 */
export function laneStyle(lane: number, lanes: number): { readonly left: string; readonly width: string } {
  const share = `min(100%, max(${MIN_CARD_PX}px, ${100 / lanes}%))`;
  const left = lanes === 1 ? "0px" : `calc((100% - ${share}) * ${lane / (lanes - 1)})`;
  return { left: `calc(${left} + 2px)`, width: `calc(${share} - 4px)` };
}

/**
 * Lays out spans that overlap in time side by side. Spans in one overlap cluster take the first
 * lane that is free when they start. `laneStyle` decides how wide each lane is drawn.
 */
export function layoutOverlaps<T extends Span>(items: readonly T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: Placed<T>[] = [];
  let cluster: { item: T; column: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const placed of cluster) {
      result.push({ ...placed, columns: laneEnds.length });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      closeCluster();
    }
    let column = laneEnds.findIndex((end) => end <= item.start);
    if (column === -1) {
      column = laneEnds.length;
      laneEnds.push(item.end);
    } else {
      laneEnds[column] = item.end;
    }
    cluster.push({ item, column });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  closeCluster();
  return result;
}
