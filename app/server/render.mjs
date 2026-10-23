// Local render worker and API server. Bundles the Remotion entry once,
// renders the ChatReel composition to a real 1080x1920 H.264 MP4, reports progress,
// manages project storage, and serves downloads.
import express from "express";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { buildServer } from "./mcp-tools.mjs";
import {
  ROOT_DIR,
  TEMP_DIR,
  validateProject,
  renderProjectMedia,
  renderProjectStill,
  saveProjectFile,
  getProjectFile,
  listProjectFiles,
  deleteProjectFile,
} from "./core.mjs";

const PORT = Number(process.env.PORT) || 4000;
const DIST = path.join(ROOT_DIR, "dist"); // built editor, served in production
const RETENTION_MS = 30 * 60 * 1000; // delete outputs after 30 min

const app = express();
app.use(express.json({ limit: "4mb" }));

// serve the built editor (production). In dev, Vite serves it on 5173 and proxies /api.
if (fs.existsSync(DIST)) app.use(express.static(DIST));

// ── in-memory job store ──
/** @type {Map<string, {status:string, progress:number, file?:string, error?:string, createdAt:number}>} */
const jobs = new Map();

async function runRender(id, project) {
  const job = jobs.get(id);
  try {
    job.status = "preparing";
    const file = path.join(TEMP_DIR, `${id}.mp4`);
    job.status = "rendering";
    await renderProjectMedia(project, {
      outputPath: file,
      onProgress: ({ progress }) => {
        job.progress = progress;
      },
    });
    job.status = "completed";
    job.progress = 1;
    job.file = file;
    // schedule cleanup
    setTimeout(() => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
      jobs.delete(id);
    }, RETENTION_MS);
  } catch (e) {
    job.status = "failed";
    job.error = (e && e.message) || "Render failed.";
    console.error("Render failed:", job.error);
  }
}

// ── Project Persistence API ──
app.get("/api/projects", (_req, res) => {
  res.json(listProjectFiles());
});

app.get("/api/projects/:id", (req, res) => {
  const p = getProjectFile(req.params.id);
  if (!p) return res.status(404).json({ error: "Project not found." });
  res.json(p);
});

app.post("/api/projects", (req, res) => {
  const p = req.body;
  try {
    const saved = saveProjectFile(p);
    res.json(saved);
  } catch (e) {
    res.status(400).json({ error: (e && e.message) || "Failed to save project." });
  }
});

app.delete("/api/projects/:id", (req, res) => {
  const ok = deleteProjectFile(req.params.id);
  res.json({ success: ok });
});

// ── Render Jobs API ──
app.post("/api/renders", (req, res) => {
  const project = req.body?.project;
  const err = validateProject(project);
  if (err) return res.status(400).json({ error: err });
  const id = randomUUID();
  jobs.set(id, { status: "queued", progress: 0, createdAt: Date.now() });
  runRender(id, project); // fire and forget
  res.json({ id });
});

// poll status
app.get("/api/renders/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: "Unknown job." });
  res.json({ status: job.status, progress: job.progress, error: job.error, hasFile: !!job.file });
});

// download the finished file
app.get("/api/renders/:id/download", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job || !job.file || !fs.existsSync(job.file)) return res.status(404).json({ error: "File not available." });
  res.download(job.file, "chatvid.mp4");
});

// ── single-frame screenshot (PNG) ──
app.post("/api/stills", async (req, res) => {
  const project = req.body?.project;
  const err = validateProject(project);
  if (err) return res.status(400).json({ error: err });
  const file = path.join(TEMP_DIR, `${randomUUID()}.png`);
  try {
    await renderProjectStill(project, { frame: req.body?.frame, outputPath: file });
    res.download(file, "chatvid.png", () => {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {}
    });
  } catch (e) {
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch {}
    res.status(500).json({ error: (e && e.message) || "Screenshot failed." });
  }
});

// ── remote MCP connector (stateless Streamable HTTP) ──
// A fresh server + transport per request; no session state to leak across calls.
async function handleMcp(req, res) {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(e?.message || e) }, id: null });
  }
}
app.post("/mcp", handleMcp);
app.get("/mcp", handleMcp);

// SPA fallback: any non-API, non-MCP GET returns the editor (production only)
app.get(/^(?!\/(api|mcp)\b).*/, (_req, res, next) => {
  const index = path.join(DIST, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

// bind 0.0.0.0 so the reverse proxy (Caddy) can reach it inside the container
app.listen(PORT, "0.0.0.0", () => console.log(`ChatVid server on :${PORT}`));
