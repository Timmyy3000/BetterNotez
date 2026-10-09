import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ShapeOutput, ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type ToolHandler<Shape extends ZodRawShapeCompat> = (args: ShapeOutput<Shape>) => unknown;

export interface ToolRegistry {
  tool<Shape extends ZodRawShapeCompat>(
    name: string,
    description: string,
    inputSchema: Shape,
    handler: ToolHandler<Shape>,
  ): void;
}

/**
 * Runs tool calls one at a time. The library is plain files, so two overlapping calls that
 * both read and rewrite annotations.json, tasks.json, or notes.json would drop one of the writes.
 */
export function createRegistry(server: McpServer): ToolRegistry {
  let queue: Promise<unknown> = Promise.resolve();
  return {
    tool<Shape extends ZodRawShapeCompat>(
      name: string,
      description: string,
      inputSchema: Shape,
      handler: ToolHandler<Shape>,
    ): void {
      const callback = (args: ShapeOutput<Shape>): Promise<CallToolResult> => {
        const run = queue.then(() => handler(args));
        queue = run.catch(() => undefined);
        return run.then(succeed, fail);
      };
      // The SDK types its callback as a conditional on the schema, which TypeScript leaves
      // unresolved for a generic shape. The SDK calls it with exactly ShapeOutput<Shape>.
      server.registerTool(name, { description, inputSchema }, callback as unknown as ToolCallback<Shape>);
    },
  };
}

function succeed(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(error: unknown): CallToolResult {
  return { isError: true, content: [{ type: "text", text: describeError(error) }] };
}

function describeError(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => (issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`))
      .join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
