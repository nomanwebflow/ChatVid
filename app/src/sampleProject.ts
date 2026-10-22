import type { Project, Message } from "./types";
import { uid } from "./types";

const THEM = "p_them";
const ME = "p_me";

function mk(
  participantId: string,
  text: string,
  opts: Partial<Message> = {},
): Message {
  return {
    id: uid(),
    participantId,
    text,
    order: 0,
    delayMs: participantId === ME ? 650 : 0,
    readingDurationMs: participantId === ME ? 450 : 1200,
    animation: "pop",
    animationDurationMs: 280,
    typingDurationMs: participantId === THEM ? 1600 : 0,
    readReceipt: participantId === ME,
    ...opts,
  };
}

export function createSampleProject(): Project {
  const now = new Date().toISOString();
  const raw: Message[] = [
    mk(THEM, "Hey, sorry I missed your call! What's up?", { timestamp: "10:14", typingDurationMs: 1800, readingDurationMs: 1200 }),
    mk(ME, "No worries man. Quick one. You're my go-to marketing guru.", { timestamp: "10:14", delayMs: 2800, readingDurationMs: 0 }),
    mk(ME, "My product is just not selling, and my ad metrics SUCK.", { timestamp: "10:15", delayMs: 400, readingDurationMs: 0 }),
    mk(ME, "I need your help.", { timestamp: "10:15", delayMs: 400 }),
    mk(THEM, "Ah... video ads and such? It's a fun world man 🙂", { timestamp: "10:16", typingDurationMs: 2500, readingDurationMs: 1500 }),
    mk(ME, "YES! I see so many businesses with killer ads.", { timestamp: "10:16", delayMs: 2200, readingDurationMs: 0 }),
    mk(ME, "I just can't make it work.", { timestamp: "10:17", delayMs: 400 }),
  ];
  raw.forEach((m, i) => (m.order = i));

  return {
    schemaVersion: 1,
    id: uid(),
    title: "Untitled reel",
    createdAt: now,
    updatedAt: now,
    participants: [
      { id: THEM, name: "Todd", side: "left", color: "#0a6b3b" },
      { id: ME, name: "You", side: "right", color: "#2575ff" },
    ],
    messages: raw,
    appearance: {
      layout: "phone",
      themeId: "whatsapp",
      backgroundColor: "#f5f2eb",
      wallpaperUrl: "wa-bg.webp",
      contactName: "Todd",
      contactSub: "online",
      endHoldMs: 2600,
      sceneBackground: "#e9ede7",
    },
    exportSettings: { width: 1080, height: 1920, fps: 30, format: "mp4", includeAudio: false },
  };
}
