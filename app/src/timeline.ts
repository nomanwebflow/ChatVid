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
  readEnd: number;     // frame the reading pause ends (next event may begin)
};

export type Timeline = {
  events: Event[];
  totalFrames: number; // includes the end hold
};

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
    if (m.typingDurationMs > 0) {
      typingStart = cursor;
      typingEnd = cursor + msToFrames(m.typingDurationMs);
      cursor = typingEnd;
    }
    const revealStart = cursor;
    const revealEnd = revealStart + msToFrames(m.animationDurationMs);
    const readEnd = revealEnd + msToFrames(m.readingDurationMs);
    events.push({ message: m, typingStart, typingEnd, revealStart, revealEnd, readEnd });
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
