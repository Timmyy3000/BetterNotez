import { Task } from "@betternotez/core";
import { describe, expect, it } from "vitest";
import { describeDue, dueLedger } from "./ledger";

const TODAY = "2026-10-09";

const tasks = [
  Task.parse({ id: "later", title: "Problem set 4", status: "doing", order: 1, due: "2026-10-10" }),
  Task.parse({ id: "late", title: "Essay outline", status: "todo", order: 0, due: "2026-10-06" }),
  Task.parse({ id: "undated", title: "Errands", status: "todo", order: 2 }),
  Task.parse({ id: "finished", title: "Book the room", status: "done", order: 3, due: "2026-10-01" }),
  Task.parse({ id: "same-day", title: "Read chapter 3", status: "todo", order: 4, due: "2026-10-10" }),
];

describe("dueLedger", () => {
  it("lists open dated tasks with overdue ones first and skips finished or undated tasks", () => {
    const ledger = dueLedger(tasks, TODAY, 5);

    expect(ledger.map((item) => item.task.id)).toEqual(["late", "later", "same-day"]);
    expect(ledger.map((item) => item.overdue)).toEqual([true, false, false]);
  });

  it("keeps the board order when two tasks fall due on the same day", () => {
    const ledger = dueLedger(tasks, TODAY, 5).filter((item) => item.task.due === "2026-10-10");

    expect(ledger.map((item) => item.task.id)).toEqual(["later", "same-day"]);
  });

  it("stops at the limit", () => {
    expect(dueLedger(tasks, TODAY, 1).map((item) => item.task.id)).toEqual(["late"]);
  });
});

describe("describeDue", () => {
  it("names an overdue day with its date", () => {
    expect(describeDue("2026-10-06", TODAY)).toBe("Overdue, Oct 6");
  });

  it("names today", () => {
    expect(describeDue("2026-10-09", TODAY)).toBe("Today");
  });

  it("gives a weekday for a day that is still to come", () => {
    expect(describeDue("2026-10-10", TODAY)).toBe("Sat, Oct 10");
  });
});
