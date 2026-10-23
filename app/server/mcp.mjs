#!/usr/bin/env node
// ChatVid MCP server over stdio (Claude Desktop, Cursor, etc.).
// Tool definitions live in mcp-tools.mjs, shared with the remote HTTP connector.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./mcp-tools.mjs";

async function main() {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
  console.error("ChatVid MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error in ChatVid MCP server:", err);
  process.exit(1);
});
