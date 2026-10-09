import { z } from "zod";
import type { ToolRegistry } from "../registry.js";

export function registerDeletionTools(tools: ToolRegistry): void {
  tools.tool(
    "request_deletion",
    "BetterNotez does not let AI assistants delete anything. Call this only to explain to the user how to delete it themselves in the app.",
    {
      what: z.string().describe("What the student wants deleted, for example a piece of material or a subject."),
    },
    ({ what }) => {
      const target = what.trim() === "" ? "it" : `"${what.trim()}"`;
      return {
        message: `Nothing was deleted. BetterNotez does not let AI assistants delete anything. The student can delete ${target} in the BetterNotez app.`,
      };
    },
  );
}
