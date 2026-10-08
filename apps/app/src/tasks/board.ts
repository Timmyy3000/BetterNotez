import { Task, TaskStatus } from "@betternotez/core";

export type Board = Readonly<Record<TaskStatus, readonly Task[]>>;

/** Where a task lands: in `status`, directly after `above` and directly before `below`. */
export interface Drop {
  readonly status: TaskStatus;
  readonly above?: string;
  readonly below?: string;
}

export interface OrderUpdate {
  readonly id: string;
  readonly status: TaskStatus;
  readonly order: number;
}

/** Columns in board order, each sorted by `order`. */
export function toBoard(tasks: readonly Task[]): Board {
  const board: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
  for (const task of [...tasks].sort((a, b) => a.order - b.order)) {
    board[task.status].push(task);
  }
  return board;
}

/**
 * Sort key between two neighbors. A missing neighbor means the top or bottom of the column, and
 * an empty column takes 0.
 */
export function orderBetween(lower: number | undefined, upper: number | undefined): number {
  if (lower === undefined) {
    return upper === undefined ? 0 : upper - 1;
  }
  return upper === undefined ? lower + 1 : (lower + upper) / 2;
}

/**
 * The drop that a pointer or key press over `overId` means. A column id puts the task at the
 * bottom of that column. A task id puts the task beside it. Inside one column the task lands in
 * the direction it moved, as an array move does. From another column, `placeAfter` picks the
 * side of the task that the pointer is on.
 */
export function dropOver(board: Board, taskId: string, overId: string, placeAfter = false): Drop | undefined {
  if (TaskStatus.safeParse(overId).success) {
    const status = TaskStatus.parse(overId);
    const last = board[status].filter((task) => task.id !== taskId).at(-1);
    return { status, above: last?.id };
  }
  const status = statusOf(board, overId);
  if (status === undefined || overId === taskId) {
    return placementOf(board, taskId);
  }
  const column = board[status];
  const from = column.findIndex((task) => task.id === taskId);
  const to = column.findIndex((task) => task.id === overId);
  if (from === -1) {
    return placeAfter ? { status, above: overId } : { status, below: overId };
  }
  return from < to ? { status, above: overId } : { status, below: overId };
}

/** The board with the task moved to the drop position. Positions are kept by array order. */
export function placeTask(board: Board, taskId: string, drop: Drop): Board {
  const task = findTask(board, taskId);
  if (task === undefined) {
    return board;
  }
  const next: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [] };
  for (const status of TaskStatus.options) {
    next[status] = board[status].filter((other) => other.id !== taskId);
  }
  next[drop.status].splice(insertionIndex(next[drop.status], drop), 0, { ...task, status: drop.status });
  return next;
}

/**
 * The order values to persist for a drop. Usually that is the moved task alone. When the gap
 * between its neighbors has no room left for a new float, the whole destination column is
 * renumbered from 0.
 */
export function planDrop(board: Board, taskId: string, drop: Drop): OrderUpdate[] {
  if (findTask(board, taskId) === undefined) {
    return [];
  }
  const column = placeTask(board, taskId, drop)[drop.status];
  const index = column.findIndex((task) => task.id === taskId);
  const lower = column[index - 1]?.order;
  const upper = column[index + 1]?.order;
  const order = orderBetween(lower, upper);

  if ((lower === undefined || order > lower) && (upper === undefined || order < upper)) {
    return [{ id: taskId, status: drop.status, order }];
  }

  return column.flatMap((task, position) =>
    task.id === taskId || task.order !== position
      ? [{ id: task.id, status: drop.status, order: position }]
      : [],
  );
}

/** A task is overdue when it is not done and its due date is before today (YYYY-MM-DD). */
export function isOverdue(task: Pick<Task, "status" | "due">, today: string): boolean {
  return task.status !== "done" && task.due !== undefined && task.due < today;
}

/** The local calendar date as YYYY-MM-DD. */
export function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function findTask(board: Board, taskId: string): Task | undefined {
  return TaskStatus.options.flatMap((status) => board[status]).find((task) => task.id === taskId);
}

export function statusOf(board: Board, taskId: string): TaskStatus | undefined {
  return TaskStatus.options.find((status) => board[status].some((task) => task.id === taskId));
}

function placementOf(board: Board, taskId: string): Drop | undefined {
  const status = statusOf(board, taskId);
  if (status === undefined) {
    return undefined;
  }
  const column = board[status];
  const index = column.findIndex((task) => task.id === taskId);
  return { status, above: column[index - 1]?.id, below: column[index + 1]?.id };
}

function insertionIndex(column: readonly Task[], drop: Drop): number {
  if (drop.above !== undefined) {
    const index = column.findIndex((task) => task.id === drop.above);
    if (index !== -1) return index + 1;
  }
  if (drop.below !== undefined) {
    const index = column.findIndex((task) => task.id === drop.below);
    if (index !== -1) return index;
  }
  return column.length;
}
