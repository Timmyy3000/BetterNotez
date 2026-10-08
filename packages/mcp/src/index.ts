#!/usr/bin/env node
import { homedir } from "node:os";
import { Library } from "@betternotez/core";
import { NodeFsStorage } from "@betternotez/core/node";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveLibraryPath } from "./config.js";
import { createServer } from "./server.js";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) {
  console.error(`betternotez-mcp: Node.js 22 or newer is required (found ${process.versions.node}).`);
  process.exit(1);
}

try {
  const libraryPath = resolveLibraryPath(process.argv.slice(2), process.env, homedir());
  const library = new Library(new NodeFsStorage(libraryPath));
  await library.init();
  await createServer(library).connect(new StdioServerTransport());
} catch (error) {
  console.error(`betternotez-mcp: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
