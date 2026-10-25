// Shared timeline engine. Both the preview and the renderer derive visual state
// from the FRAME NUMBER via these functions — never from wall-clock timers.
import type { Project, Message } from "./types";
import { FPS } from "./types";

const msToFrames = (ms: number) => Math.round((ms / 1000) * FPS);

export type Event = {
  message: Message;
  typingStart: number; // frame the typing indicator appears (== -1 if none)
  typingEnd: number;   // frame typing disappears
  revealStart: number; // frame the bubble starts its entry animation
  revealEnd: number;   // frame entry animation finishes
  voiceStart: number;  // frame the voice note starts playing (-1 if not a voice message)
  voiceEnd: number;    // frame it finishes
  readEnd: number;     // frame the reading pause ends (next event may begin)
};

// beat between a voice bubble landing and its audio starting to play
export const VOICE_LEAD_MS = 350;

export type Timeline = {
  events: Event[];
  totalFrames: number; // includes the end hold
};

// How long a message "types" before it lands. Your own plain-text messages type on the on-screen
// keyboard; a typing time of 0 means auto (about 85 ms per character), anything else is explicit.
export function typingMsOf(project: Project, m: Message): number {
  if (m.typingDurationMs > 0) return m.typingDurationMs;
  const mine = project.participants.find((p) => p.id === m.participantId)?.side === "right";
  if (!mine || m.voice || m.image || !m.text.trim()) return 0;
  return Math.min(5000, Math.max(900, Array.from(m.text).length * 85));
}

// Build the ordered schedule. S_i = E_{i-1} + delay; a message occupies
// [typing] -> [reveal animation] -> [reading pause].
export function buildTimeline(project: Project): Timeline {
  const ordered = [...project.messages].sort((a, b) => a.order - b.order);
  const events: Event[] = [];
  let cursor = msToFrames(400); // small lead-in, matches the preview's initial pause

  for (const m of ordered) {
    cursor += msToFrames(m.delayMs);
    let typingStart = -1;
    let typingEnd = cursor;
    const typingMs = typingMsOf(project, m);
    if (typingMs > 0) {
      typingStart = cursor;
      typingEnd = cursor + msToFrames(typingMs);
      cursor = typingEnd;
    }
    const revealStart = cursor;
    const revealEnd = revealStart + msToFrames(m.animationDurationMs);
    // a voice note plays out in full before the reading pause begins
    let voiceStart = -1, voiceEnd = -1, readFrom = revealEnd;
    if (m.voice) {
      voiceStart = revealEnd + msToFrames(VOICE_LEAD_MS);
      voiceEnd = voiceStart + Math.max(1, msToFrames(m.voice.durationMs));
      readFrom = voiceEnd;
    }
    const readEnd = readFrom + msToFrames(m.readingDurationMs);
    events.push({ message: m, typingStart, typingEnd, revealStart, revealEnd, voiceStart, voiceEnd, readEnd });
    cursor = readEnd;
  }

  const totalFrames = cursor + msToFrames(project.appearance.endHoldMs);
  return { events, totalFrames: Math.max(totalFrames, 1) };
}

// Per-message visual state at a given frame.
export type MessageState = {
  visible: boolean;  // bubble is on screen (mid or post entry)
  progress: number;  // 0..1 entry animation progress
};

export function messageStateAt(ev: Event, frame: number): MessageState {
  if (frame < ev.revealStart) return { visible: false, progress: 0 };
  if (frame >= ev.revealEnd) return { visible: true, progress: 1 };
  const span = Math.max(1, ev.revealEnd - ev.revealStart);
  return { visible: true, progress: (frame - ev.revealStart) / span };
}

export function typingVisibleAt(ev: Event, frame: number): boolean {
  return ev.typingStart >= 0 && frame >= ev.typingStart && frame < ev.typingEnd;
}

// Which message index is "current" at a frame (for editor highlight).
export function currentEventIndex(tl: Timeline, frame: number): number {
  let idx = -1;
  for (let i = 0; i < tl.events.length; i++) {
    if (frame >= tl.events[i].revealStart) idx = i;
  }
  return idx;
}

export const framesToSeconds = (f: number) => f / FPS;

// ── auto timestamps ──
// A message with no timestamp gets one at render time, chained from the message before
// it: previous time + 0-3 min. The chain starts at the FIRST message's time (typed or
// imported), in the same style ("10:14", "08:21" or "1:47 AM"). Set a time on any later
// message and the chain carries on from there. With no time anywhere, it starts at a
// random 12:00-2:59 AM. "Random" is seeded from the project/message ids (FNV-1a), so every
// frame, the preview and the exported video all show the same times. Clearing a
// message's timestamp field puts it back on the chain.
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

type ClockStyle = { ampm: boolean; pad: boolean };

// "10:14", "08:21", "9:41 PM", "1:47am" -> minutes since midnight + how it was written
export function parseClock(s: string): { minutes: number; style: ClockStyle } | null {
  const m = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp])\.?[Mm]\.?)?\s*$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ap = m[3]?.toLowerCase();
  if (min > 59 || h > 23) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ap === "p" ? 12 : 0);
  }
  return { minutes: h * 60 + min, style: { ampm: !!ap, pad: m[1].length === 2 } };
}

function formatClock(mins: number, style: ClockStyle): string {
  const m = ((mins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  if (style.ampm) return `${h24 % 12 === 0 ? 12 : h24 % 12}:${mm} ${h24 < 12 ? "AM" : "PM"}`;
  return `${style.pad ? String(h24).padStart(2, "0") : h24}:${mm}`;
}

// every message id -> the time its bubble shows
export function autoStamps(project: Project): Record<string, string> {
  const ordered = [...project.messages].sort((a, b) => a.order - b.order);
  const reveal = new Map(buildTimeline(project).events.map((e) => [e.message.id, e.revealStart]));
  const out: Record<string, string> = {};
  // the clock runs at real pace: minutes advance with the video time since the anchor message
  let anchor: { minutes: number; frame: number } | null = null;
  let style: ClockStyle = { ampm: true, pad: false };
  for (const m of ordered) {
    const frame = reveal.get(m.id) ?? 0;
    const typed = m.timestamp?.trim();
    const parsed = typed ? parseClock(typed) : null;
    if (typed) {
      out[m.id] = typed;
      if (parsed) { anchor = { minutes: parsed.minutes, frame }; style = parsed.style; }
      continue;
    }
    if (!anchor) anchor = { minutes: hash32(project.id) % 180, frame };
    out[m.id] = formatClock(anchor.minutes + Math.floor((frame - anchor.frame) / FPS / 60), style);
  }
  return out;
}
