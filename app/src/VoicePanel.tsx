// Inspector panel for a message's voice note: upload an MP3 (or any audio file),
// record from the microphone, preview it, replace it, or remove it.
import { useEffect, useRef, useState } from "react";
import { Mic, Upload, Square, Play, Pause, Trash2, TriangleAlert } from "lucide-react";
import type { Message, VoiceNote } from "./types";
import { DESIGN_PEAKS, MAX_VOICE_MS, WAVE_BARS, fmtVoiceTime, isAudioFile, voiceFromBlob } from "./voice";

const IC = 14;

type Props = {
  m: Message;
  onChange: (id: string, patch: Partial<Message>, squash?: boolean) => void;
};

type Rec = { rec: MediaRecorder; stream: MediaStream; timer: number };

export function VoicePanel({ m, onChange }: Props) {
  const v = m.voice;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const recRef = useRef<Rec | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function stopPreview() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPreviewing(false);
  }

  // The panel is keyed by message id, so selecting another message unmounts it: that must
  // never leave the mic recording or a preview playing.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      const r = recRef.current;
      if (r) {
        r.rec.onstop = null;
        clearInterval(r.timer);
        if (r.rec.state !== "inactive") r.rec.stop();
        r.stream.getTracks().forEach((t) => t.stop());
        recRef.current = null;
      }
    };
  }, []);

  async function attach(make: () => Promise<VoiceNote>) {
    setBusy(true); setError(null); stopPreview();
    try {
      const note = await make();
      const text = !m.text || m.text === "New message" ? "Voice message" : m.text;
      onChange(m.id, { voice: note, image: undefined, text }); // a message is a voice note OR a photo
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add that audio.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    if (!isAudioFile(file)) { setError("Please choose an audio file (MP3, M4A, WAV…)."); return; }
    attach(() => voiceFromBlob(file, file.name));
  }

  async function startRecording() {
    setError(null); stopPreview();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Recording isn't supported in this browser. Upload a file instead.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in the browser to record.");
      return;
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    const t0 = Date.now();
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.push(ev.data); };
    const timer = window.setInterval(() => {
      const ms = Date.now() - t0;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) rec.stop(); // hard stop at the 5 min limit
    }, 200);
    rec.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
      setRecording(false);
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      attach(() => voiceFromBlob(blob, "Recording"));
    };
    recRef.current = { rec, stream, timer };
    setElapsed(0);
    setRecording(true);
    rec.start(250);
  }

  function stopRecording() {
    const r = recRef.current;
    if (r && r.rec.state !== "inactive") r.rec.stop();
  }

  function togglePreview() {
    if (!v?.src) return;
    if (previewing) { stopPreview(); return; }
    const a = new Audio(v.src);
    a.onended = () => setPreviewing(false);
    a.play().then(() => setPreviewing(true)).catch(() => setError("Could not play that audio."));
    audioRef.current = a;
  }

  const peaks = v && v.peaks.length === WAVE_BARS ? v.peaks : DESIGN_PEAKS;

  const pick = (label: string) => (
    <label className={`tb-btn file-btn${busy ? " is-disabled" : ""}`} title="Upload an MP3 or other audio file (up to 10 MB)">
      <Upload size={IC} /> {label}
      <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac" onChange={onFile} disabled={busy || recording} hidden />
    </label>
  );

  return (
    <div className="field voice-panel">
      <label>Voice message</label>

      {recording ? (
        <div className="voice-rec" role="status">
          <span className="rec-dot" aria-hidden="true" />
          <span className="rec-time">Recording {fmtVoiceTime(elapsed)}</span>
          <button type="button" className="tb-btn" onClick={stopRecording}><Square size={IC} /> Stop</button>
        </div>
      ) : (
        <>
          {v && (
            <div className="voice-card">
              <button type="button" className="icon-btn" onClick={togglePreview} disabled={!v.src}
                aria-label={previewing ? "Pause preview" : "Play preview"} title={v.src ? "Preview the audio" : "No audio yet"}>
                {previewing ? <Pause size={IC} /> : <Play size={IC} />}
              </button>
              <div className="voice-mini" aria-hidden="true">
                {peaks.map((p, i) => <i key={i} style={{ height: 3 + Math.max(0, Math.min(1, p)) * 15 }} />)}
              </div>
              <span className="voice-dur">{fmtVoiceTime(v.durationMs)}</span>
            </div>
          )}
          <div className="voice-actions">
            {pick(v ? "Replace" : "Upload MP3")}
            <button type="button" className="tb-btn" onClick={startRecording} disabled={busy} title="Record from your microphone">
              <Mic size={IC} /> {v ? "Re-record" : "Record"}
            </button>
            {v && (
              <button type="button" className="tb-btn" disabled={busy}
                onClick={() => { stopPreview(); onChange(m.id, { voice: undefined }); }} title="Turn back into a text message">
                <Trash2 size={IC} /> Remove
              </button>
            )}
          </div>
          <p className="hint">
            {busy ? "Reading the audio…"
              : v ? (v.src ? `${v.name || "Audio"} · plays in the video right after the bubble appears. The message text is not shown.`
                          : "No audio yet. Upload an MP3 or record one; until then the note plays silently for its length.")
              : "Turn this into a voice message: upload an MP3 or record one. It plays in the video after the bubble appears."}
          </p>
        </>
      )}

      {error && <p className="warn"><TriangleAlert size={13} /> {error}</p>}
    </div>
  );
}
