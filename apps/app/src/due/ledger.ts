import type { Task } from "@betternotez/core";
import { isOverdue } from "../tasks/board";

export interface DueItem {
  readonly task: Task;
  /** How the due date reads, such as "Overdue, Oct 6", "Today", or "Sat, Oct 10". */
  readonly when: string;
  readonly overdue: boolean;
}

type DatedTask = Task & { readonly due: string };

/** Open tasks that have a due date, earliest first. Overdue ones lead, and a done task never appears. */
export function dueLedger(tasks: readonly Task[], today: string, limit: number): DueItem[] {
  return tasks
    .filter(isOpenAndDated)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.order - b.order))
    .slice(0, limit)
    .map((task) => ({ task, when: describeDue(task.due, today), overdue: isOverdue(task, today) }));
}

export function describeDue(due: string, today: string): string {
  const date = new Date(`${due}T00:00:00`);
  if (due < today) return `Overdue, ${formatDay(date, { month: "short", day: "numeric" })}`;
  if (due === today) return "Today";
  return formatDay(date, { weekday: "short", month: "short", day: "numeric" });
}

function isOpenAndDated(task: Task): task is DatedTask {
  return task.due !== undefined && task.status !== "done";
}

function formatDay(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", options).format(date);
}
