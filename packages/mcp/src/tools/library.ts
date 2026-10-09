import type { Library } from "@betternotez/core";
import { z } from "zod";
import type { ToolRegistry } from "../registry.js";
import { hexColor, subjectRef } from "./shared.js";

export function registerLibraryTools(tools: ToolRegistry, library: Library): void {
  tools.tool("list_subjects", "List subjects, the folders that group material.", {}, () =>
    library.listSubjects(),
  );

  tools.tool(
    "create_subject",
    "Create a subject for one course or topic.",
    {
      name: z.string().describe("Subject name, such as a course or topic."),
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
    "List material, optionally only the material in one subject.",
    { subjectId: subjectRef.optional() },
    ({ subjectId }) => library.listLectures(subjectId),
  );

  tools.tool(
    "find_lecture",
    "Find material by a phrase such as \"Lecture 1 in [subject name]\". Call this first when the student names a piece of material. Returns ranked matches; an empty list means nothing matched.",
    { query: z.string().min(1) },
    ({ query }) => library.findLecture(query),
  );

  tools.tool(
    "search",
    "Search subject names, material titles, notepads, text boxes, and PDF text. Each hit names its material and, when relevant, its page.",
    { query: z.string().min(1) },
    ({ query }) => library.search(query),
  );
}
