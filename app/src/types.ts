// Project schema — single source of truth for editor, preview, and (future) renderer.
export type SenderSide = "left" | "right";
export type EntryAnimation = "instant" | "fade" | "slide" | "pop";
export type Layout = "phone" | "fullscreen";

export type Participant = {
  id: string;
  name: string;
  side: SenderSide;
  color: string;      // avatar gradient base
  avatarUrl?: string;
};

export type Message = {
  id: string;
  participantId: string;
  text: string;
  order: number;
  delayMs: number;           // pause before this message starts
  readingDurationMs: number; // pause after it appears
  animation: EntryAnimation;
  animationDurationMs: number;
  typingDurationMs: number;  // 0 = no typing indicator
  timestamp?: string;
  readReceipt: boolean;
};

export type Appearance = {
  layout: Layout;
  themeId: string;
  backgroundColor: string;
  wallpaperUrl?: string;
  contactName: string;
  contactSub: string;        // "online" / "typing…" override while idle
  endHoldMs: number;
  sceneBackground: string;   // CSS behind the phone (color or gradient); also fills export margins
};

export type ExportSettings = {
  width: 1080;
  height: 1920;
  fps: 30;
  format: "mp4";
  includeAudio: boolean;
};

export type Project = {
  schemaVersion: 1;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  participants: Participant[];
  messages: Message[];
  appearance: Appearance;
  exportSettings: ExportSettings;
};

export const FPS = 30;
export const uid = () => Math.random().toString(36).slice(2, 10);
