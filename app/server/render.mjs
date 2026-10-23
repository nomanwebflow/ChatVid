// Local render worker. Bundles the Remotion entry once, renders the ChatReel
// composition to a real 1080x1920 H.264 MP4, reports progress, serves download.
import express from "express";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENTRY = path.join(ROOT, "src", "remotion", "index.ts");
const OUT_DIR = path.join(os.tmpdir(), "chat-reel-renders");
fs.mkdirSync(OUT_DIR, { recursive: true });

const PORT = Number(process.env.PORT) || 4000;
const DIST = path.join(ROOT, "dist"); // built editor, served in production
const MAX_FRAMES = 60 * 30; // 60s cap (spec limit)
const RETENTION_MS = 30 * 60 * 1000; // delete outputs after 30 min

const app = express();
app.use(express.json({ limit: "4mb" }));

// serve the built editor (production). In dev, Vite serves it on 5173 and proxies /api.
if (fs.existsSync(DIST)) app.use(express.static(DIST));

// ── bundle once, reuse across renders ──
let bundlePromise = null;
function getBundle() {
  if (!bundlePromise) {
    console.log("Bundling Remotion project…");
    bundlePromise = bundle({ entryPoint: ENTRY, publicDir: path.join(ROOT, "public") });
  }
  return bundlePromise;
}

// ── in-memory job store ──
/** @type {Map<string, {status:string, progress:number, file?:string, error?:string, createdAt:number}>} */
const jobs = new Map();

// basic project validation — reject bad data before an expensive render
function validate(project) {
  if (!project || project.schemaVersion !== 1) return "Unsupported or missing schemaVersion.";
  if (!Array.isArray(project.participants) || project.participants.length < 1) return "No participants.";
  if (!Array.isArray(project.messages) || project.messages.length < 1) return "No messages.";
  for (const m of project.messages) {
    if (!project.participants.some((p) => p.id === m.participantId)) return `Message references unknown participant ${m.participantId}.`;
    for (const k of ["delayMs", "readingDurationMs", "animationDurationMs", "typingDurationMs"]) {
      if (!Number.isFinite(m[k]) || m[k] < 0) return `Invalid ${k} on a message.`;
    }
  }
  return null;
}

async function runRender(id, project) {
  const job = jobs.get(id);
  try {
    job.status = "preparing";
    const serveUrl = await getBundle();
    const composition = await selectComposition({ serveUrl, id: "ChatReel", inputProps: { project } });
    if (composition.durationInFrames > MAX_FRAMES) {
      throw new Error(`Video is too long (${Math.round(composition.durationInFrames / 30)}s). Max is 60s.`);
    }
    job.status = "rendering";
    const file = path.join(OUT_DIR, `${id}.mp4`);
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: file,
      inputProps: { project },
      onProgress: ({ progress }) => { job.progress = progress; },
    });
    job.status = "completed";
    job.progress = 1;
    job.file = file;
    // schedule cleanup
    setTimeout(() => { try { fs.existsSync(file) && fs.unlinkSync(file); } catch {} jobs.delete(id); }, RETENTION_MS);
  } catch (e) {
    job.status = "failed";
    job.error = (e && e.message) || "Render failed.";
    console.error("Render failed:", job.error);
  }
}

// create a render job
app.post("/api/renders", (req, res) => {
  const project = req.body?.project;
  const err = validate(project);
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
// Renders one frame at full 1080x1920 via the same bundle as the video, so the
// screenshot matches the export exactly. Synchronous: one frame is quick.
app.post("/api/stills", async (req, res) => {
  const project = req.body?.project;
  const err = validate(project);
  if (err) return res.status(400).json({ error: err });
  const file = path.join(OUT_DIR, `${randomUUID()}.png`);
  try {
    const serveUrl = await getBundle();
    const composition = await selectComposition({ serveUrl, id: "ChatReel", inputProps: { project } });
    // default to the last frame (fully-revealed chat); allow an explicit frame.
    const last = Math.max(0, composition.durationInFrames - 1);
    let frame = Number(req.body?.frame);
    if (!Number.isFinite(frame)) frame = last;
    frame = Math.min(last, Math.max(0, Math.round(frame)));
    await renderStill({ composition, serveUrl, output: file, frame, inputProps: { project } });
    res.download(file, "chatvid.png", () => {
      try { fs.existsSync(file) && fs.unlinkSync(file); } catch {}
    });
  } catch (e) {
    try { fs.existsSync(file) && fs.unlinkSync(file); } catch {}
    res.status(500).json({ error: (e && e.message) || "Screenshot failed." });
  }
});

// SPA fallback: any non-API GET returns the editor (production only)
app.get(/^(?!\/api\/).*/, (_req, res, next) => {
  const index = path.join(DIST, "index.html");
  if (fs.existsSync(index)) return res.sendFile(index);
  next();
});

// bind 0.0.0.0 so the reverse proxy (Caddy) can reach it inside the container
app.listen(PORT, "0.0.0.0", () => console.log(`ChatVid server on :${PORT}`));
