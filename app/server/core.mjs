// Core headless engine for ChatVid.
// Provides script parsing, project synthesis, file persistence, and Remotion rendering
// shared by both the HTTP render worker and the MCP server.

import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mediaPath } from "./media.mjs";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
export const ENTRY_POINT = path.join(ROOT_DIR, "src", "remotion", "index.ts");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const OUTPUTS_DIR = path.join(DATA_DIR, "outputs");
export const TEMP_DIR = path.join(os.tmpdir(), "chat-reel-renders");

// Ensure directories exist
for (const dir of [DATA_DIR, PROJECTS_DIR, OUTPUTS_DIR, TEMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const FPS = 30;
export const MAX_FRAMES = 10 * 60 * FPS; // 10 minutes max ceiling

// ── Remotion Bundle Cache ──
let bundlePromise = null;
export function getRemotionBundle() {
  if (!bundlePromise) {
    bundlePromise = bundle({
      entryPoint: ENTRY_POINT,
      publicDir: path.join(ROOT_DIR, "public"),
    });
  }
  return bundlePromise;
}

// ── Project Validation ──
export function validateProject(project) {
  if (!project || project.schemaVersion !== 1) return "Unsupported or missing schemaVersion (must be 1).";
  if (!Array.isArray(project.participants) || project.participants.length < 1) return "At least 1 participant is required.";
  if (!Array.isArray(project.messages) || project.messages.length < 1) return "At least 1 message is required.";
  for (const m of project.messages) {
    if (!project.participants.some((p) => p.id === m.participantId)) {
      return `Message references unknown participant ${m.participantId}.`;
    }
    for (const k of ["delayMs", "readingDurationMs", "animationDurationMs", "typingDurationMs"]) {
      if (!Number.isFinite(m[k]) || m[k] < 0) return `Invalid ${k} on message: must be non-negative number.`;
    }
    if (m.image != null) {
      const im = m.image;
      if (typeof im.src !== "string" || !(/^data:image\/(png|jpe?g|webp|gif);/.test(im.src) || mediaPath(im.src))) return "A photo message needs an image data: URI or stored media URL (png, jpeg, webp or gif).";
      if (!Number.isFinite(im.width) || !Number.isFinite(im.height) || im.width <= 0 || im.height <= 0) return "A photo message needs a positive width and height.";
    }
    if (m.voice != null) {
      const v = m.voice;
      if (typeof v.src !== "string") return "A voice message needs a src string (empty for a silent placeholder).";
      if (!Number.isFinite(v.durationMs) || v.durationMs < 0 || v.durationMs > 5 * 60 * 1000) return "A voice message's durationMs must be between 0 and 5 minutes.";
      if (!Array.isArray(v.peaks)) return "A voice message needs a peaks array (may be empty).";
      if (v.src && !(/^data:audio\/|^data:video\/webm|^data:application\/ogg/.test(v.src) || mediaPath(v.src))) return "A voice message's audio must be an audio data: URI.";
    }
  }
  return null;
}

// ── Media attachments (voice notes + photos) ──
// The editor stores a voice note's audio and a photo as data: URIs inside the project.
// Passing megabytes of base64 through Remotion's input props is slow and fragile, so before
// a render each one is written to a file inside the bundle's public folder (where
// staticFile() finds it) and the project given to Remotion points at that file. A still
// never plays audio, so it drops the audio (`audio: false`) but keeps the photos.
const AUDIO_EXT = { "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/ogg": "ogg", "audio/webm": "webm", "video/webm": "webm", "application/ogg": "ogg" };
const IMAGE_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" };

async function withMediaAssets(project, { audio }) {
  const clone = structuredClone(project);
  const written = [];
  const dirs = {};
  // write one data URI to <bundle>/public/<kind>/<uuid>.<ext>; returns the path staticFile() resolves
  async function materialize(kind, dataUri, extMap) {
    const stored = mediaPath(dataUri); // already on the VPS: copy the file instead of decoding
    const match = stored ? null : /^data:([^;,]+)[^,]*;base64,([\s\S]*)$/.exec(dataUri);
    if (!match && !stored) return null;
    if (!dirs[kind]) {
      dirs[kind] = path.join(await getRemotionBundle(), "public", kind);
      fs.mkdirSync(dirs[kind], { recursive: true });
    }
    const name = `${randomUUID()}.${stored ? path.extname(stored).slice(1) : extMap[match[1].toLowerCase()] || "bin"}`;
    const file = path.join(dirs[kind], name);
    if (stored) fs.copyFileSync(stored, file); else fs.writeFileSync(file, Buffer.from(match[2], "base64"));
    written.push(file);
    return `${kind}/${name}`;
  }
  for (const m of clone.messages) {
    if (m.voice?.src) m.voice.src = (audio && (await materialize("voice", m.voice.src, AUDIO_EXT))) || "";
    if (m.image?.src) m.image.src = (await materialize("media", m.image.src, IMAGE_EXT)) || "";
  }
  // avatars + wallpaper stored on the VPS: the renderer's browser fetches them over HTTP
  const abs = (u) => (/^\/api\/media\//.test(u || "") ? `http://127.0.0.1:${process.env.PORT || 4000}${u}` : u);
  for (const p of clone.participants || []) if (p.avatarUrl) p.avatarUrl = abs(p.avatarUrl);
  if (clone.appearance?.wallpaperUrl) clone.appearance.wallpaperUrl = abs(clone.appearance.wallpaperUrl);
  return {
    project: clone,
    cleanup: () => { for (const f of written) { try { fs.unlinkSync(f); } catch { /* already gone */ } } },
  };
}

// ── Timeline Calculation (Headless equivalent of timeline.ts) ──
const msToFrames = (ms) => Math.round((ms / 1000) * FPS);

export function calculateTimelineStats(project) {
  const ordered = [...project.messages].sort((a, b) => a.order - b.order);
  let cursor = msToFrames(400); // 400ms lead-in pause
  for (const m of ordered) {
    cursor += msToFrames(m.delayMs || 0);
    const mine = project.participants.find((p) => p.id === m.participantId)?.side === "right";
    const typingMs = m.typingDurationMs > 0 ? m.typingDurationMs
      : mine && project.appearance?.keyboardTyping !== false && !m.voice && !m.image && (m.text || "").trim() ? Math.min(5000, Math.max(900, Array.from(m.text).length * 85)) : 0; // keep in sync with src/timeline.ts typingMsOf
    if (typingMs > 0) {
      cursor += msToFrames(typingMs);
    }
    cursor += msToFrames(m.animationDurationMs || 280);
    // a voice note plays out (after a 350 ms beat) before the reading pause, as in src/timeline.ts
    if (m.voice) cursor += msToFrames(350) + Math.max(1, msToFrames(m.voice.durationMs || 0));
    cursor += msToFrames(m.readingDurationMs || 600);
  }
  const endHold = msToFrames(project.appearance?.endHoldMs ?? 2600);
  const totalFrames = Math.max(cursor + endHold, 1);
  return {
    totalFrames,
    durationSeconds: Number((totalFrames / FPS).toFixed(2)),
    messageCount: project.messages.length,
  };
}

// ── Script Parsing & Project Synthesis ──
const SPEAKER_RE = /^\s*([^\n:]{1,24}):\s?(.*)$/;
const TIME_RE = /(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp]\.?[Mm]\.?)?)/;

function stripLeadingTimestamp(line) {
  let m = line.match(/^\s*\[([^\]]*?)\]\s*(.*)$/);
  if (m) {
    const t = m[1].match(TIME_RE);
    if (t) return { time: normalizeTime(t[1]), rest: m[2] };
  }
  m = line.match(/^\s*(.*?)\s[-–]\s(.*)$/);
  if (m) {
    const t = m[1].match(TIME_RE);
    if (t && /^[\d/.,:\s APMapm–-]+$/.test(m[1])) {
      return { time: normalizeTime(t[1]), rest: m[2] };
    }
  }
  return { time: "", rest: line };
}

function normalizeTime(s) {
  const m = s.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s?([AaPp]\.?[Mm]\.?)?$/);
  if (!m) return s.trim();
  const ap = m[2] ? " " + m[2].replace(/\./g, "").toUpperCase() : "";
  return m[1] + ap;
}

function formatClock(mins) {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60), min = m % 60;
  const ap = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${ap}`;
}

export function parseScript(rawScript) {
  const lines = rawScript.replace(/\r\n/g, "\n").split("\n");
  const parsed = [];
  const speakers = [];

  for (const line of lines) {
    if (!line.trim()) {
      if (parsed.length && parsed[parsed.length - 1].speaker !== null) {
        parsed[parsed.length - 1].text += "\n";
      }
      continue;
    }
    const { time, rest } = stripLeadingTimestamp(line);
    const m = rest.match(SPEAKER_RE);
    if (m) {
      const speaker = m[1].trim();
      if (!speakers.includes(speaker)) speakers.push(speaker);
      parsed.push({ speaker, text: m[2], time });
    } else if (parsed.length && parsed[parsed.length - 1].speaker !== null) {
      parsed[parsed.length - 1].text += (parsed[parsed.length - 1].text ? "\n" : "") + line;
    } else {
      parsed.push({ speaker: "You", text: line, time });
      if (!speakers.includes("You")) speakers.push("You");
    }
  }

  return {
    lines: parsed.map((l) => ({ ...l, text: l.text.replace(/\n+$/, "") })),
    speakers,
  };
}

const DEFAULT_AVATAR_COLORS = ["#0a6b3b", "#2575ff", "#9c27b0", "#e91e63", "#ff9800"];

export function createProjectFromScript(scriptText, options = {}) {
  const { lines, speakers } = parseScript(scriptText);
  if (lines.length === 0) {
    throw new Error("Script does not contain any readable messages. Format: 'Speaker: Message text'");
  }

  // Setup participants
  const participants = [];
  let rightParticipantId = null;
  let leftParticipantId = null;

  const hasExplicitMe = speakers.some((s) => /^(you|me)$/i.test(s));

  speakers.forEach((speakerName, idx) => {
    const isMe = /^(you|me)$/i.test(speakerName);
    let side;
    if (isMe) {
      side = "right";
    } else if (hasExplicitMe) {
      side = "left";
    } else {
      // In dialogue with no explicit "You"/"Me":
      if (options.swapSides) {
        side = idx === 0 ? "right" : (idx === 1 ? "left" : "left");
      } else {
        side = idx === 0 ? "left" : (idx === 1 ? "right" : "left");
      }
    }

    const id = side === "right" && isMe ? "p_me" : `p_${idx + 1}`;
    if (side === "right" && !rightParticipantId) rightParticipantId = id;
    if (side === "left" && !leftParticipantId) leftParticipantId = id;

    participants.push({
      id,
      name: speakerName,
      side,
      color: DEFAULT_AVATAR_COLORS[idx % DEFAULT_AVATAR_COLORS.length],
    });
  });

  // Ensure at least one right side participant
  if (!rightParticipantId) {
    rightParticipantId = "p_me";
    participants.push({
      id: rightParticipantId,
      name: "You",
      side: "right",
      color: "#2575ff",
    });
  }

  // Ensure at least one left side participant
  if (!leftParticipantId) {
    leftParticipantId = "p_them";
    participants.unshift({
      id: leftParticipantId,
      name: options.contactName || "Contact",
      side: "left",
      color: "#0a6b3b",
    });
  }

  const primaryLeftSpeaker = participants.find((p) => p.side === "left") || participants[0];
  if (options.contactName) {
    primaryLeftSpeaker.name = options.contactName;
  }

  // Starting timestamp clock
  let clockMinutes = 614; // Default ~10:14 AM
  if (options.startClock) {
    const m = options.startClock.match(/(\d{1,2}):(\d{2})\s?([AaPp][Mm])?/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      const isPm = m[3] && m[3].toUpperCase() === "PM";
      if (isPm && h < 12) h += 12;
      if (!isPm && h === 12) h = 0;
      clockMinutes = h * 60 + min;
    }
  }

  // Build messages with natural WhatsApp pacing
  let prevSpeakerId = null;
  const messages = lines.map((line, idx) => {
    const participant = participants.find((p) => p.name.toLowerCase() === line.speaker.toLowerCase())
      || (line.speaker.toLowerCase() === "you" || line.speaker.toLowerCase() === "me"
        ? participants.find((p) => p.id === rightParticipantId)
        : primaryLeftSpeaker);
    const participantId = participant.id;
    const isMe = participant.side === "right";

    let stamp = line.time;
    if (!stamp) {
      if (idx > 0 && idx % 3 === 0) clockMinutes += 1;
      stamp = formatClock(clockMinutes);
    }

    const isSpeakerChange = prevSpeakerId !== null && prevSpeakerId !== participantId;
    prevSpeakerId = participantId;

    // Reading & typing durations scaled to text length
    const charCount = line.text.length;
    const typingDurationMs = isMe ? 0 : Math.min(2800, Math.max(1200, Math.round(charCount * 55)));
    const readingDurationMs = isMe
      ? (idx === lines.length - 1 ? 1200 : 450)
      : Math.min(2200, Math.max(800, Math.round(charCount * 38)));
    const delayMs = isSpeakerChange ? (isMe ? 850 : 600) : 350;

    return {
      id: randomUUID().slice(0, 8),
      participantId,
      text: line.text,
      order: idx,
      delayMs,
      readingDurationMs,
      animation: "pop",
      animationDurationMs: 280,
      typingDurationMs,
      timestamp: stamp,
      readReceipt: isMe,
    };
  });

  const now = new Date().toISOString();
  const contactName = options.contactName || primaryLeftSpeaker.name || "Todd";
  const contactSub = options.contactStatus || "online";
  const title = options.title || `Chat with ${contactName}`;

  /** @type {import('../src/types').Project} */
  const project = {
    schemaVersion: 1,
    id: options.id || randomUUID().slice(0, 8),
    title,
    createdAt: now,
    updatedAt: now,
    participants,
    messages,
    appearance: {
      layout: options.layout || "phone",
      themeId: "whatsapp",
      backgroundColor: "#f5f2eb",
      wallpaperUrl: options.wallpaper === "blank" ? "" : "wa-bg.webp",
      contactName,
      contactSub,
      endHoldMs: 2600,
      sceneBackground: options.sceneBackground || "#e9ede7",
    },
    exportSettings: {
      width: 1080,
      height: 1920,
      fps: 30,
      format: "mp4",
      includeAudio: false,
    },
  };

  const validationErr = validateProject(project);
  if (validationErr) {
    throw new Error(`Generated project failed validation: ${validationErr}`);
  }

  return project;
}

// ── Project Persistence ──
export function saveProjectFile(project) {
  const err = validateProject(project);
  if (err) throw new Error(err);
  project.updatedAt = new Date().toISOString();
  const filePath = path.join(PROJECTS_DIR, `${project.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(project, null, 2), "utf8");
  return project;
}

export function getProjectFile(id) {
  const filePath = path.join(PROJECTS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  return JSON.parse(content);
}

export function listProjectFiles() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith(".json"));
  const list = [];
  for (const file of files) {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, file), "utf8"));
      const stats = calculateTimelineStats(p);
      list.push({
        id: p.id,
        title: p.title || "Untitled reel",
        updatedAt: p.updatedAt || p.createdAt,
        messageCount: stats.messageCount,
        durationSeconds: stats.durationSeconds,
        contactName: p.appearance?.contactName || "Contact",
      });
    } catch {}
  }
  return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function deleteProjectFile(id) {
  const filePath = path.join(PROJECTS_DIR, `${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// ── Rendering ──
export async function renderProjectMedia(project, options = {}) {
  const err = validateProject(project);
  if (err) throw new Error(err);

  const serveUrl = await getRemotionBundle();
  // voice-note audio goes to files in the bundle for the duration of the render
  const media = await withMediaAssets(project, { audio: true });
  const renderable = media.project;
  try {
    const composition = await selectComposition({
      serveUrl,
      id: "ChatReel",
      inputProps: { project: renderable },
    });

    if (composition.durationInFrames > MAX_FRAMES) {
      throw new Error(`Video duration (${Math.round(composition.durationInFrames / FPS)}s) exceeds max ceiling of 10 minutes.`);
    }

    const outputPath = options.outputPath || path.join(OUTPUTS_DIR, `${project.id || randomUUID().slice(0, 8)}.mp4`);
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: { project: renderable },
      onProgress: options.onProgress || undefined,
    });

    const fileStats = fs.statSync(outputPath);
    const timelineStats = calculateTimelineStats(project);

    return {
      outputPath,
      totalFrames: composition.durationInFrames,
      durationSeconds: timelineStats.durationSeconds,
      fileSizeBytes: fileStats.size,
    };
  } finally {
    media.cleanup();
  }
}

export async function renderProjectStill(project, options = {}) {
  const err = validateProject(project);
  if (err) throw new Error(err);

  const serveUrl = await getRemotionBundle();
  // a still never plays audio: drop it so the render props stay small (photos are still shown)
  const media = await withMediaAssets(project, { audio: false });
  const renderable = media.project;
  try {
    const composition = await selectComposition({
      serveUrl,
      id: "ChatReel",
      inputProps: { project: renderable },
    });

    const lastFrame = Math.max(0, composition.durationInFrames - 1);
    let frame = options.frame !== undefined ? Number(options.frame) : lastFrame;
    if (!Number.isFinite(frame)) frame = lastFrame;
    frame = Math.min(lastFrame, Math.max(0, Math.round(frame)));

    const outputPath = options.outputPath || path.join(OUTPUTS_DIR, `${project.id || randomUUID().slice(0, 8)}_frame_${frame}.png`);
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    await renderStill({
      composition,
      serveUrl,
      output: outputPath,
      frame,
      inputProps: { project: renderable },
    });

    return {
      outputPath,
      frame,
      totalFrames: composition.durationInFrames,
    };
  } finally {
    media.cleanup();
  }
}
