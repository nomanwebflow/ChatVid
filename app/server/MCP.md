# ChatVid MCP Server

Lets an AI agent create, edit, preview and render WhatsApp-style chat reels.
Transport: **stdio** (local). 7 tools + 1 prompt, defined in `mcp.mjs`, backed by
`core.mjs` (shared with the HTTP render worker).

## Tools

| Tool | Does |
|---|---|
| `chatvid_create_video` | Script → rendered MP4 in one step, saved as a project |
| `chatvid_preview_still` | Render one frame to PNG (from a script or a project) |
| `chatvid_create_project` | Script → saved project, no render |
| `chatvid_render_project` | Render an existing project by id |
| `chatvid_list_projects` | List saved projects |
| `chatvid_get_project` | Full project JSON + stats |
| `chatvid_update_project` | Edit title / contact / appearance / messages |

Prompt: `chatvid_prompt_viral_reel` — scriptwriting template.

## Run locally

```bash
cd app && npm install
npm run mcp
```

First render downloads the headless Chrome shell once (~170 MB), then caches it.

## Claude Desktop

Add to `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chatvid": {
      "command": "node",
      "args": ["/absolute/path/to/chatvid/app/server/mcp.mjs"]
    }
  }
}
```

Restart Claude Desktop. The same block works in Cursor / other MCP stdio clients.

## Env

| Var | Default | |
|---|---|---|
| `CHATVID_WEB_URL` | `https://chatvid.nomanahmed.io` | base for returned `webUrl` links |
| `CHATVID_RENDER_TIMEOUT_MS` | `300000` | reject a render that hangs past this |

## Claude Connector (remote MCP) — not yet built

The stdio server above is **local only**. A Claude *connector* (how Webflow,
Figma, etc. appear in claude.ai) is a **remote MCP server** with a different shape:

- **Transport:** Streamable HTTP over public HTTPS. stdio is not accepted for connectors.
- **Auth:** OAuth 2.1 (PKCE, secure redirects, server-side token validation), or
  authless. Claude supports Dynamic Client Registration; hosted callback is on
  `claude.ai` — confirm the exact callback path against current Anthropic docs.
- **Network:** Claude calls from Anthropic's cloud (IP range ~`160.79.104.0/21`),
  so the server must be reachable over HTTPS.
- **Tool metadata:** each tool needs a title and `readOnlyHint` / `destructiveHint`
  annotations for directory review.
- **Plans:** custom remote connectors need Pro/Max/Team/Enterprise; directory
  submission needs Team/Enterprise + Directory permission.

**Path to a connector from here:** the tool logic in `core.mjs` is reusable as-is.
What's new is a thin HTTP layer — swap `StdioServerTransport` for the SDK's
`StreamableHTTPServerTransport`, mount it on an Express route behind the existing
Caddy HTTPS on the VPS, and add the OAuth flow (or ship authless first to validate
the shape). Long renders should move to the async job pattern the HTTP worker
already uses, so a connector call returns fast and polls.

Refs:
- Anthropic: building custom connectors via remote MCP servers
  (support.anthropic.com/en/articles/11503834)
- MCP connector docs: platform.claude.com/docs/en/agents-and-tools/mcp-connector
