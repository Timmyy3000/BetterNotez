import { type Library, TaskStatus } from "@betternotez/core";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import { calendarDate, lectureRef, subjectRef, taskRef } from "./shared.js";

export function registerTaskTools(tools: ToolRegistry, library: Library): void {
  tools.tool(
    "list_tasks",
    "List tasks in board order: To do, then Doing, then Done.",
    { status: TaskStatus.optional().describe("Only tasks in this column.") },
    async ({ status }) => {
      const tasks = await library.listTasks();
      return status === undefined ? tasks : tasks.filter((task) => task.status === status);
    },
  );

  tools.tool(
    "create_task",
    "Create a task. Status defaults to todo. Subject, material, and due date are optional.",
    {
      title: z.string().min(1),
      status: TaskStatus.optional(),
      subjectId: subjectRef.optional(),
      lectureId: lectureRef.optional(),
      due: calendarDate.optional(),
    },
    (input) => library.createTask(input),
  );

  tools.tool(
    "update_task",
    "Edit a task. Set status to todo, doing, or done to move it between columns. Pass null for subjectId, lectureId, or due to clear the link.",
    {
      taskId: taskRef,
      title: z.string().min(1).optional(),
      status: TaskStatus.optional(),
      order: z.number().optional().describe("Position in the column, 0 is first. Omit to append when the status changes."),
      subjectId: subjectRef.nullable().optional(),
      lectureId: lectureRef.nullable().optional(),
      due: calendarDate.nullable().optional(),
    },
    ({ taskId, ...patch }) => library.updateTask(taskId, patch),
  );
}
