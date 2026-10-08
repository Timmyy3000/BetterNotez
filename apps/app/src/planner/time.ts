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

/**
 * Lays out spans that overlap in time side by side. Spans in one overlap cluster share the
 * width evenly, and each span takes the first lane that is free when it starts.
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
