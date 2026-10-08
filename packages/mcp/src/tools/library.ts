import type { Library } from "@betternotez/core";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import { hexColor, subjectRef } from "./shared.js";

export function registerLibraryTools(tools: ToolRegistry, library: Library): void {
  tools.tool("list_subjects", "List subjects, the folders that group lectures.", {}, () =>
    library.listSubjects(),
  );

  tools.tool(
    "create_subject",
    "Create a subject for a course.",
    {
      name: z.string().describe("Subject name, for example Digital Systems."),
      color: hexColor.optional(),
    },
    (input) => library.createSubject(input),
  );

  tools.tool(
    "update_subject",
    "Rename a subject or change its color.",
    {
      subjectId: subjectRef,
      name: z.string().optional(),
      color: hexColor.optional(),
    },
    ({ subjectId, ...patch }) => library.updateSubject(subjectId, patch),
  );

  tools.tool(
    "list_lectures",
    "List lectures, optionally only those in one subject.",
    { subjectId: subjectRef.optional() },
    ({ subjectId }) => library.listLectures(subjectId),
  );

  tools.tool(
    "find_lecture",
    "Find lectures by a phrase such as \"Lecture 1 in Digital Systems\". Call this first when the student names a lecture. Returns ranked matches; an empty list means nothing matched.",
    { query: z.string().min(1) },
    ({ query }) => library.findLecture(query),
  );

  tools.tool(
    "search",
    "Search subject names, lecture titles, notepads, text boxes, and PDF text. Each hit names its lecture and, when relevant, its page.",
    { query: z.string().min(1) },
    ({ query }) => library.search(query),
  );
}
