import { Task, type TaskStatus } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { dropOver, isOverdue, localDateKey, orderBetween, placeTask, planDrop, toBoard } from "./board";

const task = (id: string, status: TaskStatus, order: number) => Task.parse({ id, title: id, status, order });

describe("toBoard", () => {
  it("sorts each column by order", () => {
    const board = toBoard([task("a", "todo", 2), task("b", "todo", 1), task("c", "doing", 0)]);

    expect(board.todo.map((item) => item.id)).toEqual(["b", "a"]);
    expect(board.doing.map((item) => item.id)).toEqual(["c"]);
    expect(board.done).toEqual([]);
  });
});

describe("orderBetween", () => {
  it("starts an empty column at 0", () => {
    expect(orderBetween(undefined, undefined)).toBe(0);
  });

  it("goes past either end of a column", () => {
    expect(orderBetween(undefined, 0)).toBe(-1);
    expect(orderBetween(3, undefined)).toBe(4);
  });

  it("takes the midpoint of two neighbors", () => {
    expect(orderBetween(0, 1)).toBe(0.5);
    expect(orderBetween(0.5, 1)).toBe(0.75);
  });
});

describe("dropOver", () => {
  const board = toBoard([
    task("a", "todo", 0),
    task("b", "todo", 1),
    task("c", "todo", 2),
    task("d", "doing", 0),
  ]);

  it("drops at the bottom of a column when the column itself is the target", () => {
    expect(dropOver(board, "d", "todo")).toEqual({ status: "todo", above: "c" });
    expect(dropOver(board, "a", "doing")).toEqual({ status: "doing", above: "d" });
  });

  it("drops above a task that is in another column", () => {
    expect(dropOver(board, "d", "a")).toEqual({ status: "todo", below: "a" });
  });

  it("drops below a task in another column when the pointer is on its lower side", () => {
    expect(dropOver(board, "d", "a", true)).toEqual({ status: "todo", above: "a" });
  });

  it("drops after a task that the dragged task moved down past", () => {
    expect(dropOver(board, "a", "c")).toEqual({ status: "todo", above: "c" });
  });

  it("drops before a task that the dragged task moved up past", () => {
    expect(dropOver(board, "c", "a")).toEqual({ status: "todo", below: "a" });
  });

  it("keeps a task where it is when it is dropped on itself", () => {
    expect(dropOver(board, "b", "b")).toEqual({ status: "todo", above: "a", below: "c" });
  });
});

describe("planDrop", () => {
  const board = toBoard([task("a", "todo", 0), task("b", "todo", 1), task("c", "doing", 0)]);

  it("sets the order of a task dropped into an empty column to 0", () => {
    expect(planDrop(board, "a", { status: "done" })).toEqual([{ id: "a", status: "done", order: 0 }]);
  });

  it("uses the midpoint between the tasks on either side", () => {
    expect(planDrop(board, "c", { status: "todo", above: "a", below: "b" })).toEqual([
      { id: "c", status: "todo", order: 0.5 },
    ]);
  });

  it("goes above the first task and below the last task", () => {
    expect(planDrop(board, "c", { status: "todo", below: "a" })).toEqual([
      { id: "c", status: "todo", order: -1 },
    ]);
    expect(planDrop(board, "c", { status: "todo", above: "b" })).toEqual([
      { id: "c", status: "todo", order: 2 },
    ]);
  });

  it("keeps the task's order when it is dropped where it already is", () => {
    expect(planDrop(board, "a", { status: "todo", below: "b" })).toEqual([
      { id: "a", status: "todo", order: 0 },
    ]);
  });

  it("renumbers the column when the gap between neighbors has no float left", () => {
    const tight = toBoard([task("a", "todo", 1), task("b", "todo", 1 + Number.EPSILON), task("c", "doing", 0)]);

    expect(planDrop(tight, "c", { status: "todo", above: "a", below: "b" })).toEqual([
      { id: "a", status: "todo", order: 0 },
      { id: "c", status: "todo", order: 1 },
      { id: "b", status: "todo", order: 2 },
    ]);
  });

  it("returns nothing for an unknown task", () => {
    expect(planDrop(board, "missing", { status: "done" })).toEqual([]);
  });
});

describe("placeTask", () => {
  it("moves a task between columns at the drop position", () => {
    const board = toBoard([task("a", "todo", 0), task("b", "doing", 0), task("c", "doing", 1)]);
    const next = placeTask(board, "a", { status: "doing", above: "b" });

    expect(next.todo).toEqual([]);
    expect(next.doing.map((item) => [item.id, item.status])).toEqual([
      ["b", "doing"],
      ["a", "doing"],
      ["c", "doing"],
    ]);
  });
});

describe("isOverdue", () => {
  it("flags an open task whose due date has passed", () => {
    expect(isOverdue({ status: "todo", due: "2026-10-07" }, "2026-10-08")).toBe(true);
    expect(isOverdue({ status: "doing", due: "2026-10-07" }, "2026-10-08")).toBe(true);
  });

  it("does not flag a done task, a task due today, or a task without a due date", () => {
    expect(isOverdue({ status: "done", due: "2026-10-07" }, "2026-10-08")).toBe(false);
    expect(isOverdue({ status: "todo", due: "2026-10-08" }, "2026-10-08")).toBe(false);
    expect(isOverdue({ status: "todo" }, "2026-10-08")).toBe(false);
  });
});

describe("localDateKey", () => {
  it("formats the local calendar date", () => {
    expect(localDateKey(new Date(2026, 9, 8, 23, 30))).toBe("2026-10-08");
  });
});
