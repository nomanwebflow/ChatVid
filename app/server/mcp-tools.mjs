// Shared ChatVid MCP tool definitions. Used by both the stdio server (mcp.mjs)
// and the remote Streamable HTTP connector mounted in render.mjs.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import path from "node:path";
import {
  OUTPUTS_DIR,
  createProjectFromScript,
  saveProjectFile,
  getProjectFile,
  listProjectFiles,
  renderProjectMedia,
  renderProjectStill,
  calculateTimelineStats,
  validateProject,
} from "./core.mjs";

const WEB_BASE_URL = process.env.CHATVID_WEB_URL || "https://chatvid.nomanahmed.io";
const RENDER_TIMEOUT_MS = Number(process.env.CHATVID_RENDER_TIMEOUT_MS) || 5 * 60 * 1000;

// reject a hung render instead of stalling the agent forever.
// ponytail: timeout only; the orphaned render keeps running to completion, fine for a local store.
function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)}s.`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const fail = (e) => ({ isError: true, content: [{ type: "text", text: `Error: ${(e && e.message) || String(e)}` }] });

// Build a fully-configured MCP server. A fresh instance per call keeps the
// stateless HTTP transport safe; the stdio server reuses one.
export function buildServer() {
  const server = new McpServer({ name: "chatvid", version: "1.0.0" });

  server.registerTool(
    "chatvid_create_video",
    {
      description:
        "Generate and render a complete WhatsApp chat reel video (1080x1920 H.264 MP4) from a plain text dialogue script in one step. Saves the project so it can also be edited in the ChatVid web UI.",
      annotations: { title: "Create video", readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        script: z.string().describe("Dialogue script. Format: 'Speaker: Message' per line."),
        title: z.string().optional(),
        contactName: z.string().optional(),
        contactStatus: z.string().optional(),
        wallpaper: z.enum(["whatsapp", "blank"]).optional(),
        layout: z.enum(["phone", "fullscreen"]).optional(),
        startClock: z.string().optional(),
        outputPath: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const project = createProjectFromScript(args.script, args);
        saveProjectFile(project);
        const destPath = args.outputPath || path.join(OUTPUTS_DIR, `${project.id}.mp4`);
        const r = await withTimeout(renderProjectMedia(project, { outputPath: destPath }), RENDER_TIMEOUT_MS, "Video render");
        return ok({
          status: "success", videoPath: r.outputPath, projectId: project.id,
          durationSeconds: r.durationSeconds, totalFrames: r.totalFrames, fileSizeBytes: r.fileSizeBytes,
          messageCount: project.messages.length, webUrl: `${WEB_BASE_URL}/?project=${project.id}`,
        });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_preview_still",
    {
      description:
        "Render a full-resolution 1080x1920 PNG still of a chat reel to inspect styling before rendering video.",
      annotations: { title: "Preview still", readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        script: z.string().optional(),
        projectId: z.string().optional(),
        frame: z.number().optional(),
        outputPath: z.string().optional(),
      },
    },
    async (args) => {
      try {
        let project;
        if (args.projectId) {
          project = getProjectFile(args.projectId);
          if (!project) throw new Error(`Project ${args.projectId} not found.`);
        } else if (args.script) {
          project = createProjectFromScript(args.script);
          saveProjectFile(project);
        } else throw new Error("Must provide either 'script' or 'projectId'.");
        const destPath = args.outputPath || path.join(OUTPUTS_DIR, `${project.id}_preview.png`);
        const r = await withTimeout(renderProjectStill(project, { frame: args.frame, outputPath: destPath }), RENDER_TIMEOUT_MS, "Still render");
        return ok({ status: "success", imagePath: r.outputPath, frame: r.frame, totalFrames: r.totalFrames, projectId: project.id, webUrl: `${WEB_BASE_URL}/?project=${project.id}` });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_create_project",
    {
      description:
        "Create and save a ChatVid project from a script without rendering. Returns project id, timing breakdown, and a web URL.",
      annotations: { title: "Create project", readOnlyHint: false, destructiveHint: false },
      inputSchema: {
        script: z.string(),
        title: z.string().optional(),
        contactName: z.string().optional(),
        contactStatus: z.string().optional(),
        wallpaper: z.enum(["whatsapp", "blank"]).optional(),
        layout: z.enum(["phone", "fullscreen"]).optional(),
        startClock: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const project = createProjectFromScript(args.script, args);
        saveProjectFile(project);
        const stats = calculateTimelineStats(project);
        return ok({
          status: "success", projectId: project.id, title: project.title,
          durationSeconds: stats.durationSeconds, totalFrames: stats.totalFrames, messageCount: stats.messageCount,
          participants: project.participants.map((p) => ({ name: p.name, side: p.side, color: p.color })),
          webUrl: `${WEB_BASE_URL}/?project=${project.id}`,
        });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_render_project",
    {
      description: "Render an existing ChatVid project to an MP4 by its project id.",
      annotations: { title: "Render project", readOnlyHint: false, destructiveHint: false },
      inputSchema: { projectId: z.string(), outputPath: z.string().optional() },
    },
    async (args) => {
      try {
        const project = getProjectFile(args.projectId);
        if (!project) throw new Error(`Project ${args.projectId} not found.`);
        const destPath = args.outputPath || path.join(OUTPUTS_DIR, `${project.id}.mp4`);
        const r = await withTimeout(renderProjectMedia(project, { outputPath: destPath }), RENDER_TIMEOUT_MS, "Video render");
        return ok({ status: "success", videoPath: r.outputPath, projectId: project.id, durationSeconds: r.durationSeconds, totalFrames: r.totalFrames, fileSizeBytes: r.fileSizeBytes, webUrl: `${WEB_BASE_URL}/?project=${project.id}` });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_list_projects",
    {
      description: "List all projects saved in the ChatVid project store.",
      annotations: { title: "List projects", readOnlyHint: true, destructiveHint: false },
      inputSchema: {},
    },
    async () => {
      try {
        const projects = listProjectFiles().map((p) => ({ ...p, webUrl: `${WEB_BASE_URL}/?project=${p.id}` }));
        return ok({ projects });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_get_project",
    {
      description: "Retrieve the complete JSON configuration of a project by id.",
      annotations: { title: "Get project", readOnlyHint: true, destructiveHint: false },
      inputSchema: { projectId: z.string() },
    },
    async (args) => {
      try {
        const project = getProjectFile(args.projectId);
        if (!project) throw new Error(`Project ${args.projectId} not found.`);
        return ok({ ...project, stats: calculateTimelineStats(project), webUrl: `${WEB_BASE_URL}/?project=${project.id}` });
      } catch (e) { return fail(e); }
    }
  );

  server.registerTool(
    "chatvid_update_project",
    {
      description: "Update a project's title, contact name/status, appearance, or message list.",
      annotations: { title: "Update project", readOnlyHint: false, destructiveHint: true },
      inputSchema: {
        projectId: z.string(),
        title: z.string().optional(),
        contactName: z.string().optional(),
        contactStatus: z.string().optional(),
        messages: z.array(z.any()).optional(),
        appearance: z.record(z.any()).optional(),
      },
    },
    async (args) => {
      try {
        const project = getProjectFile(args.projectId);
        if (!project) throw new Error(`Project ${args.projectId} not found.`);
        if (args.title !== undefined) project.title = args.title;
        if (args.contactName !== undefined) project.appearance.contactName = args.contactName;
        if (args.contactStatus !== undefined) project.appearance.contactSub = args.contactStatus;
        if (args.appearance) project.appearance = { ...project.appearance, ...args.appearance };
        if (args.messages) project.messages = args.messages;
        const err = validateProject(project);
        if (err) throw new Error(`Updated project is invalid: ${err}`);
        saveProjectFile(project);
        return ok({ status: "success", projectId: project.id, title: project.title, stats: calculateTimelineStats(project), webUrl: `${WEB_BASE_URL}/?project=${project.id}` });
      } catch (e) { return fail(e); }
    }
  );

  server.registerPrompt(
    "chatvid_prompt_viral_reel",
    {
      description: "Prompt template for writing a high-retention WhatsApp chat script for ChatVid.",
      argsSchema: {
        topic: z.string().describe("Topic, premise, or scenario"),
        vibe: z.enum(["dramatic", "humorous", "mysterious", "marketing_hook"]).optional(),
      },
    },
    ({ topic, vibe }) => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Write an engaging, fast-paced WhatsApp conversation for a short-form video based on:\n\nTopic: ${topic}\nVibe: ${vibe || "dramatic"}\n\nRules:\n1. Two characters: "You" (right) and a contact like "Alex"/"Mom"/"Boss" (left).\n2. Each line: "Speaker: Message text".\n3. Scroll-stopping hook on line 1.\n4. 3-12 words per message.\n5. Build suspense/revelation/punchline.\n6. 6-10 messages (~15-25s).\n\nOutput ONLY the script lines in "Speaker: Text" format.`,
        },
      }],
    })
  );

  return server;
}
