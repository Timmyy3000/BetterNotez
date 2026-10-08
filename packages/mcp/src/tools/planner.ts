import type { Library } from "@betternotez/core";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import { cardRef, clockTime, subjectRef } from "./shared.js";

const weekday = z
  .number()
  .int()
  .min(0)
  .max(6)
  .describe("Day of the week, 0 is Monday through 6 is Sunday.");

export function registerPlannerTools(tools: ToolRegistry, library: Library): void {
  tools.tool("list_planner", "List the weekly timetable cards.", {}, () => library.listPlannerCards());

  tools.tool(
    "create_planner_card",
    "Add a subject card to the weekly timetable.",
    {
      subjectId: subjectRef,
      day: weekday,
      start: clockTime,
      end: clockTime,
      location: z.string().optional(),
    },
    (input) => library.createPlannerCard(input),
  );

  tools.tool(
    "update_planner_card",
    "Move or edit a timetable card. Pass null for location to clear it.",
    {
      cardId: cardRef,
      subjectId: subjectRef.optional(),
      day: weekday.optional(),
      start: clockTime.optional(),
      end: clockTime.optional(),
      location: z.string().nullable().optional(),
    },
    ({ cardId, ...patch }) => library.updatePlannerCard(cardId, patch),
  );
}
