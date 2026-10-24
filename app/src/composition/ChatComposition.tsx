import { useCurrentFrame, staticFile, Audio, Sequence } from "remotion";
import { useLayoutEffect, useRef, useState } from "react";
import type { Project, Message } from "../types";
import { buildTimeline, messageStateAt, typingVisibleAt, currentEventIndex, autoStamps } from "../timeline";
import { TailThem, TailMe, CheckTick, StatusIcons, Chevron, CallIcons, ComposerIcons, avatarDataUri } from "./svg";
import { VoiceBubble } from "./VoiceBubble";
import { ImageBubble } from "./ImageBubble";
import "./chat.css";

type Props = {
  project: Project;
  // editor preview only (never set when rendering a video)
  playerPlaying?: boolean;
  onVoiceToggle?: (messageId: string) => void;
};

// A voice note's audio: data/http URIs play as-is (editor preview). The render server
// swaps data URIs for files in the bundle's public folder, which staticFile() resolves.
function voiceAudioSrc(src: string): string {
  if (/^(data:|https?:|blob:)/.test(src)) return src;
  return staticFile(src.replace(/^\//, ""));
}

// Resolve a wallpaper src for BOTH the Player and the Remotion render.
// Bundled assets (bare filename) must go through staticFile() so they resolve
// against the render bundle's static root; data URIs and absolute URLs pass through.
function wallpaperSrc(url: string): string {
  if (/^(data:|https?:|blob:)/.test(url)) return url;
  // saved projects (and the editor's wallpaper option) still say "wa-bg.webp":
  // that slot now holds the Figma chat wallpaper
  if (url === "wa-bg.webp") return staticFile("figma/chat-bg.png");
  return staticFile(url.replace(/^\//, ""));
}

// Entry transform from animation type + 0..1 progress.
function entryStyle(anim: Message["animation"], p: number): React.CSSProperties {
  if (p >= 1 || anim === "instant") return { opacity: 1, transform: "none" };
  const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
  switch (anim) {
    case "fade": return { opacity: ease };
    case "slide": return { opacity: ease, transform: `translateY(${Math.round((1 - ease) * 18)}px)` };
    case "pop":
    default: return { opacity: ease, transform: `translateY(${Math.round((1 - ease) * 8)}px) scale(${0.96 + 0.04 * ease})` };
  }
}

const A = (name: string) => staticFile(`figma/${name}`);

function TypingDots({ frame }: { frame: number }) {
  // frame-driven bounce (3 dots, staggered) — deterministic, no CSS timers.
  const dot = (i: number) => {
    const phase = ((frame - i * 4.5) % 36) / 36; // ~1.2s cycle at 30fps
    const up = phase < 0.3 ? Math.sin((phase / 0.3) * Math.PI) : 0;
    return { transform: `translateY(${-4 * up}px)`, opacity: 0.35 + 0.55 * up } as React.CSSProperties;
  };
  return (
    <span className="typing-dots">
      <span style={dot(0)} /><span style={dot(1)} /><span style={dot(2)} />
    </span>
  );
}

function RecordingAudioIndicator({ frame, mine }: { frame: number; mine?: boolean }) {
  // Deterministic frame-driven audio waveform bars: 5 bars simulating live recording
  const bar = (i: number) => {
    const phase1 = ((frame * 2.6 + i * 7.5) % 30) / 30;
    const phase2 = ((frame * 1.3 - i * 4.2) % 20) / 20;
    const wave = 0.55 * Math.sin(phase1 * Math.PI * 2) + 0.45 * Math.cos(phase2 * Math.PI * 2);
    const height = 5 + Math.abs(wave) * 14; // 5px to 19px
    return {
      height: `${height.toFixed(1)}px`,
    } as React.CSSProperties;
  };

  // Pulsing red recording dot: ~1.0s cycle
  const dotPhase = (frame % 30) / 30;
  const dotOpacity = 0.35 + 0.65 * Math.abs(Math.sin(dotPhase * Math.PI));

  return (
    <div className={`recording-audio-indicator${mine ? " me" : ""}`} aria-label="Recording audio">
      <span className="rec-live-dot" style={{ opacity: dotOpacity }} />
      <img
        className="rec-mic-icon"
        src={A(mine ? "voice-mic-me.svg" : "voice-mic-friend.svg")}
        width={18}
        height={18}
        alt=""
      />
      <div className="rec-wave-bars">
        <span style={bar(0)} />
        <span style={bar(1)} />
        <span style={bar(2)} />
        <span style={bar(3)} />
        <span style={bar(4)} />
      </div>
      <span className="rec-label">recording audio…</span>
    </div>
  );
}

export const ChatComposition: React.FC<Props> = ({ project, playerPlaying, onVoiceToggle }) => {
  const frame = useCurrentFrame();
  const tl = buildTimeline(project);
  const curIdx = currentEventIndex(tl, frame);
  const them = project.participants.find((p) => p.side === "left")!;
  const byId = (id: string) => project.participants.find((p) => p.id === id) || them;

  // flatten the schedule into rows + an active typing indicator (if any)
  const rows = tl.events.map((ev, i) => {
    const st = messageStateAt(ev, frame);
    return { ev, i, ...st };
  });
  const typingEv = tl.events.find((ev) => typingVisibleAt(ev, frame));
  const typingPart = typingEv ? byId(typingEv.message.participantId) : null;
  const isTypingActive = !!typingEv;
  const isVoiceRecording = isTypingActive && !!typingEv.message.voice;

  // Header sub-text: "recording audio…" with mic icon or "typing…" when indicator is active
  let subContent: React.ReactNode = project.appearance.contactSub;
  let subClass = "contact-sub";
  if (typingPart && typingPart.side === "left") {
    if (isVoiceRecording) {
      subClass = "contact-sub recording";
      subContent = (
        <>
          <img src={A("voice-mic-friend.svg")} className="sub-rec-mic" alt="" />
          <span>recording audio…</span>
        </>
      );
    } else {
      subClass = "contact-sub typing";
      subContent = <span>typing…</span>;
    }
  }

  // every bubble shows a time: the one typed in the editor, else one chained from the
  // message before it (starting at the first message's time)
  const stamps = autoStamps(project);
  const stampOf = (m: Message) => stamps[m.id] || "";

  // status-bar clock = the time of the newest message on screen (a phone's clock is never
  // behind a message it shows); before any message appears, the first message's time.
  // AM/PM is dropped, as iOS shows "12:47", not "12:47 AM". 9:41 only if there are no messages.
  const newestShown = [...rows].reverse().find((r) => r.visible)?.ev.message ?? tl.events[0]?.message;
  const clockText = newestShown ? stampOf(newestShown) : "";
  const statusTime = clockText ? clockText.replace(/\s?[AaPp]\.?[Mm]\.?$/, "").trim() : "9:41";

  // ── auto-scroll: keep the newest message in view as the chat grows ──
  // Deterministic for render: measure the content and viewport each frame and
  // pin the content to the bottom. The per-message entry animation grows each
  // bubble's height over its reveal window, so the overflow — and thus the
  // scroll — eases up smoothly on its own, with no cross-frame state.
  const viewportRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const targetRef = useRef(0);
  useLayoutEffect(() => {
    const vp = viewportRef.current, inner = innerRef.current;
    if (!vp || !inner) return;
    // viewport is clipped to the exact message area (top/bottom insets in CSS),
    // so its clientHeight is the visible height.
    const visible = vp.clientHeight;
    targetRef.current = Math.max(0, inner.scrollHeight - visible);
    // ease toward the bottom: ~25% of the remaining gap per frame, with a
    // minimum step so it always lands. Frames render in order, so this glide is
    // reproduced identically in the export.
    setOffset((prev) => {
      const t = targetRef.current;
      if (Math.abs(t - prev) < 0.5) return t;
      const next = prev + (t - prev) * 0.25;
      return Math.abs(t - next) < 1 ? t : next;
    });
  });

  // one short notification sound per message, at the frame it appears.
  // left (incoming) -> receive tone; right (your sent) -> soft swoosh.
  const sounds = tl.events.map((ev) => {
    const mine = byId(ev.message.participantId).side === "right";
    return { from: Math.max(0, Math.round(ev.revealStart)), src: mine ? "sfx-sent.mp3" : "sfx-receive.mp3", key: ev.message.id };
  });

  const Scene = (
    <>
      {sounds.map((s) => (
        <Sequence key={s.key} from={s.from} durationInFrames={30} layout="none">
          <Audio src={staticFile(s.src)} volume={0.7} />
        </Sequence>
      ))}
      {tl.events.filter((ev) => ev.message.voice?.src).map((ev) => (
        <Sequence key={`v-${ev.message.id}`} from={ev.voiceStart} durationInFrames={Math.max(1, ev.voiceEnd - ev.voiceStart)} layout="none">
          <Audio src={voiceAudioSrc(ev.message.voice!.src)} />
        </Sequence>
      ))}
      <div className="chat-bkg">
        {project.appearance.wallpaperUrl
          ? <div className="chat-bkg-tile" style={{ backgroundImage: `url("${wallpaperSrc(project.appearance.wallpaperUrl)}")` }} />
          : null}
      </div>

      <div className="messages-scroll" ref={viewportRef}>
        <div className="messages-inner" ref={innerRef} style={{ transform: `translateY(${-Math.round(offset)}px)` }}>
          <div className="date-row"><div className="date-chip">Today</div></div>

          {rows.map(({ ev, i, visible, progress }) => {
            if (!visible) return null;
            const m = ev.message;
            const part = byId(m.participantId);
            const mine = part.side === "right";
            const prev = tl.events[i - 1]?.message;
            const firstOfRun = !prev || prev.participantId !== m.participantId; // spacing
            // the tail sits on the LAST bubble of a same-sender run (as in the design); it moves
            // down to the next bubble the moment that one appears
            const next = rows[i + 1];
            const lastOfRun = !(next && next.visible && next.ev.message.participantId === m.participantId);
            const style = entryStyle(m.animation, progress);
            const hasReceipt = mine && !!m.readReceipt;
            const ts = stampOf(m);
            const hasTs = !!ts || hasReceipt;
            // voice notes and photos are rendered by their own bubbles, in the same row wrapper
            const inRow = (bubble: React.ReactNode) => mine ? (
              <div className={`msg-row-me${firstOfRun ? "" : " cont"}`} key={m.id} style={style}>{bubble}</div>
            ) : (
              <div className={`msg-row-them${firstOfRun ? "" : " cont"}`} key={m.id} style={style}>
                <div className="avatar-wrap">{bubble}</div>
              </div>
            );
            if (m.voice) {
              return inRow(
                <VoiceBubble m={m} ev={ev} frame={frame} mine={mine} ts={ts} lastOfRun={lastOfRun}
                  playerPlaying={playerPlaying} onToggle={onVoiceToggle ? () => onVoiceToggle(m.id) : undefined}
                  avatarSrc={part.avatarUrl || avatarDataUri(part.color)} />
              );
            }
            if (m.image) return inRow(<ImageBubble m={m} mine={mine} ts={ts} lastOfRun={lastOfRun} />);
            if (mine) {
              return (
                <div className={`msg-row-me${firstOfRun ? "" : " cont"}`} key={m.id} style={style}>
                  <div className={`bubble bubble-me${hasReceipt ? " has-receipt" : ""}${!hasTs ? " no-ts" : ""}`}>
                    {lastOfRun && <div className="tail-me"><TailMe /></div>}
                    <span className="bubble-text">{m.text}</span><span className="ts-gap" aria-hidden="true">{ts}</span>
                    <div className="ts">{ts} {m.readReceipt && <div className="check"><CheckTick /></div>}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className={`msg-row-them${firstOfRun ? "" : " cont"}`} key={m.id} style={style}>
                <div className="avatar-wrap">
                  <div className={`bubble bubble-them${!hasTs ? " no-ts" : ""}`}>
                    {lastOfRun && <div className="tail-them"><TailThem /></div>}
                    <span className="bubble-text">{m.text}</span><span className="ts-gap" aria-hidden="true">{ts}</span>
                    <div className="ts">{ts}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {typingEv && typingPart?.side === "left" && (
            <div className="msg-row-them">
              <div className="avatar-wrap">
                {typingEv.message.voice ? (
                  <div className="typing-bubble recording-audio-bubble">
                    <div className="tail-them"><TailThem /></div>
                    <RecordingAudioIndicator frame={frame} />
                  </div>
                ) : (
                  <div className="typing-bubble">
                    <div className="tail-them"><TailThem /></div>
                    <TypingDots frame={frame} />
                  </div>
                )}
              </div>
            </div>
          )}

          {typingEv && typingPart?.side === "right" && typingEv.message.voice && (
            <div className="msg-row-me">
              <div className="typing-bubble recording-audio-bubble bubble-me">
                <div className="tail-me"><TailMe /></div>
                <RecordingAudioIndicator frame={frame} mine={true} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="status-bar">
        <span className="status-time">{statusTime}</span>
        <span className="status-right"><StatusIcons /></span>
      </div>

      <div className="top-contact">
        <div className="contacts-row">
          <div className="contacts-left">
            <div className="chevron-wrap"><Chevron /></div>
            <div className="contact-block">
              <img className="contact-photo" alt="" src={them.avatarUrl || avatarDataUri(them.color)} />
              <div className="contact-txt">
                <span className="contact-name">{project.appearance.contactName}</span>
                <span className={subClass}>{subContent}</span>
              </div>
            </div>
          </div>
          <div className="call-btns"><CallIcons /></div>
        </div>
      </div>

      <div className="input-bar">
        <div className="input-inner"><ComposerIcons /></div>
        <div className="home-ind"><span className="home-bar" /></div>
      </div>
    </>
  );

  // suppress unused warning for curIdx (kept for future auto-scroll)
  void curIdx;

  if (project.appearance.layout === "fullscreen") {
    // fullscreen: phone is 393 wide; fill composition width (1080/393). Height is 393*16/9 ≈ 699
    // so the scaled result is exactly the 1080x1920 canvas (852 would overflow and crop the header).
    return (
      <div className="cmp-root" style={{ background: project.appearance.sceneBackground || "#e9ede7" }}>
        <div className="scaler" style={{ transform: `scale(${1080 / 393})` }}>
          <div className="phone fullscreen" style={{ width: 393, height: (393 * 1920) / 1080 }}>{Scene}</div>
        </div>
      </div>
    );
  }
  // phone mode: frame is 419 wide; scale so it nearly fills the 1080 width.
  return (
    <div className="cmp-root" style={{ background: project.appearance.sceneBackground || "#e9ede7" }}>
      <div className="scaler" style={{ transform: `scale(${Math.min(1080 / 419, 1920 / 878) * 0.95})` }}>
        <div className="phone-frame">
          <div className="btn-side btn-mute" /><div className="btn-side btn-vol-up" />
          <div className="btn-side btn-vol-dn" /><div className="btn-side btn-power" />
          <div className="phone">
            <div className="dynamic-island" />
            {Scene}
          </div>
        </div>
      </div>
    </div>
  );
};
