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

// An attached voice note: the message renders as a WhatsApp voice bubble and the
// audio plays in the video right after the bubble appears.
export type VoiceNote = {
  src: string;        // data: URI of the audio (uploaded file or in-browser recording); "" = silent placeholder
  durationMs: number;
  peaks: number[];    // 0..1 per waveform bar (38 bars, like the design); [] = use the design's pattern
  name?: string;      // original file name, shown in the editor
};

export type Message = {
  id: string;
  participantId: string;
  text: string;
  voice?: VoiceNote;
  order: number;
  delayMs: number;           // pause before this message starts
  readingDurationMs: number; // pause after it appears (after the voice note ends, for voice messages)
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
