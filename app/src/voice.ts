// Voice-note helpers: turn an uploaded audio file or an in-browser recording into a
// VoiceNote (data URI + real duration + waveform peaks). Runs in the editor only.
import type { VoiceNote } from "./types";

export const WAVE_BARS = 38;
export const MAX_VOICE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_VOICE_MS = 5 * 60 * 1000;       // 5 min

// bar heights (px, 4..24) of the Figma voice bubble, used until real audio is attached
const DESIGN_WAVE = [8, 14, 16, 15, 24, 20, 15, 18, 12, 15, 18, 10, 8, 6, 24, 20, 12, 18, 14, 10, 4, 15, 18, 10, 14, 8, 12, 15, 18, 20, 12, 16, 10, 6, 8, 12, 18, 10];
export const DESIGN_PEAKS = DESIGN_WAVE.map((h) => (h - 4) / 20);

// m:ss, e.g. 12000 -> "0:12"
export function fmtVoiceTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function readDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the audio file."));
    r.readAsDataURL(blob);
  });
}

// Decode to get the true duration (MediaRecorder webm has none in its header) and
// one loudness value per waveform bar.
async function analyse(blob: Blob): Promise<{ durationMs: number; peaks: number[] }> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
    const ch = buf.getChannelData(0);
    const seg = Math.max(1, Math.floor(ch.length / WAVE_BARS));
    const rms: number[] = [];
    for (let b = 0; b < WAVE_BARS; b++) {
      let sum = 0, n = 0;
      for (let i = b * seg; i < Math.min(ch.length, (b + 1) * seg); i += 4) { sum += ch[i] * ch[i]; n++; }
      rms.push(n ? Math.sqrt(sum / n) : 0);
    }
    const max = Math.max(...rms, 1e-6);
    // sqrt-ish curve so quiet speech still gives a lively waveform
    const peaks = rms.map((v) => Math.pow(v / max, 0.6));
    return { durationMs: Math.round(buf.duration * 1000), peaks };
  } finally {
    ctx.close();
  }
}

// An uploaded file or a recording -> VoiceNote. Throws a user-readable Error.
export async function voiceFromBlob(blob: Blob, name?: string): Promise<VoiceNote> {
  if (blob.size === 0) throw new Error("That audio is empty.");
  if (blob.size > MAX_VOICE_BYTES) throw new Error("Audio must be under 10 MB.");
  let info: { durationMs: number; peaks: number[] };
  try { info = await analyse(blob); }
  catch { throw new Error("Could not read that audio. Try an MP3, M4A, WAV or WebM file."); }
  if (info.durationMs > MAX_VOICE_MS) throw new Error("Voice notes can be at most 5 minutes.");
  return { src: await readDataUri(blob), durationMs: info.durationMs, peaks: info.peaks, name };
}

export const isAudioFile = (f: File) => f.type.startsWith("audio/") || /\.(mp3|m4a|wav|ogg|webm|aac)$/i.test(f.name);
