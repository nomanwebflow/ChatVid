// VPS media storage: voice notes, photos, avatars and wallpapers are kept as files on the
// server's disk (a docker volume) instead of inside the Convex project document (1 MB cap).
// Uploads need a signed-in Convex user; files are content-addressed and public by URL.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import express from "express";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export const MEDIA_DIR = process.env.CHATVID_MEDIA_DIR || path.join(process.cwd(), "data", "media");
const CONVEX_URL = process.env.CONVEX_URL || "https://rapid-duck-327.eu-west-1.convex.cloud";
const MAX_BYTES = 25 * 1024 * 1024;
const EXT = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "video/webm": "webm",
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif",
};
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));
const viewer = makeFunctionReference("users:viewer");
const NAME_RE = /^[a-f0-9]{40}\.[a-z0-9]{2,4}$/;

// the Convex user behind the request's Bearer token, or null
export async function viewerOf(req) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  if (!token) return null;
  try {
    const c = new ConvexHttpClient(CONVEX_URL);
    c.setAuth(token);
    return (await c.query(viewer, {})) || null;
  } catch { return null; }
}
export async function signedIn(req) { return !!(await viewerOf(req)); }

// "/api/media/<name>" -> absolute file path, or null
export function mediaPath(url) {
  const name = /^\/api\/media\/([^/?#]+)$/.exec(url || "")?.[1];
  if (!name || !NAME_RE.test(name)) return null;
  const file = path.join(MEDIA_DIR, name);
  return fs.existsSync(file) ? file : null;
}

export function mountMedia(app) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  app.post("/api/media", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    if (!(await signedIn(req))) return res.status(401).json({ error: "Sign in to upload media." });
    const type = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) return res.status(415).json({ error: "Unsupported media type." });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: "Empty upload." });
    const name = `${createHash("sha1").update(req.body).digest("hex")}.${ext}`;
    const file = path.join(MEDIA_DIR, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, req.body);
    res.json({ url: `/api/media/${name}` });
  });
  app.get("/api/media/:name", (req, res) => {
    const file = mediaPath(`/api/media/${req.params.name}`);
    if (!file) return res.status(404).end();
    res.set("Access-Control-Allow-Origin", "*"); // the headless renderer loads avatars/wallpapers from another origin
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.type(TYPE[path.extname(file).slice(1)] || "application/octet-stream");
    res.sendFile(file);
  });
}
