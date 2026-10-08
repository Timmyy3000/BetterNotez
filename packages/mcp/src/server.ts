import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Library } from "@betternotez/core";
import { createRegistry } from "./registry.js";
import { registerAnnotationTools } from "./tools/annotations.js";
import { registerDeletionTools } from "./tools/deletion.js";
import { registerLectureTools } from "./tools/lectures.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerPlannerTools } from "./tools/planner.js";
import { registerTaskTools } from "./tools/tasks.js";

const INSTRUCTIONS = [
  "BetterNotez holds a student's subjects, lecture PDFs, notepads, annotations, tasks, and weekly planner.",
  "When the student names a lecture, call find_lecture first.",
  "AI can create and edit everything but cannot delete. Ask the student to delete anything in the app.",
  "Positions on a page are normalized from 0 to 1, with the origin at the top-left corner.",
].join("\n");

export function createServer(library: Library): McpServer {
  const server = new McpServer(
    { name: "betternotez", version: "0.1.0" },
    { instructions: INSTRUCTIONS },
  );
  const tools = createRegistry(server);
  registerLibraryTools(tools, library);
  registerLectureTools(tools, library);
  registerAnnotationTools(tools, library);
  registerTaskTools(tools, library);
  registerPlannerTools(tools, library);
  registerDeletionTools(tools);
  return server;
}
