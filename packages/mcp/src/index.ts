#!/usr/bin/env node
import { homedir } from "node:os";
import { Library } from "@betternotez/core";
import { NodeFsStorage } from "@betternotez/core/node";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveLibraryPath } from "./config.js";
import { createServer } from "./server.js";

try {
  const libraryPath = resolveLibraryPath(process.argv.slice(2), process.env, homedir());
  const library = new Library(new NodeFsStorage(libraryPath));
  await library.init();
  await createServer(library).connect(new StdioServerTransport());
} catch (error) {
  console.error(`betternotez-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
