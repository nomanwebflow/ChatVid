import { useCurrentFrame } from "remotion";
import type { Project, Message } from "../types";
import { buildTimeline, messageStateAt, typingVisibleAt, currentEventIndex } from "../timeline";
import { TailThem, TailMe, CheckTick, StatusIcons, Chevron, CallIcons, ComposerIcons, avatarDataUri } from "./svg";
import "./chat.css";

type Props = { project: Project };

// Entry transform from animation type + 0..1 progress.
function entryStyle(anim: Message["animation"], p: number): React.CSSProperties {
  if (p >= 1 || anim === "instant") return { opacity: 1, transform: "none" };
  const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
  switch (anim) {
    case "fade": return { opacity: ease };
    case "slide": return { opacity: ease, transform: `translateY(${(1 - ease) * 18}px)` };
    case "pop":
    default: return { opacity: ease, transform: `translateY(${(1 - ease) * 8}px) scale(${0.96 + 0.04 * ease})` };
  }
}

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

export const ChatComposition: React.FC<Props> = ({ project }) => {
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

  // header sub-text: "typing…" while a left-side typing indicator is up
  const sub = typingPart && typingPart.side === "left" ? "typing…" : project.appearance.contactSub;

  const Scene = (
    <>
      <div className="chat-bkg">
        {project.appearance.wallpaperUrl ? <img src={project.appearance.wallpaperUrl} alt="" /> : null}
      </div>

      <div className="messages-scroll">
        <div className="messages-inner">
          <div className="date-row"><div className="date-chip">Today</div></div>

          {rows.map(({ ev, i, visible, progress }) => {
            if (!visible) return null;
            const m = ev.message;
            const part = byId(m.participantId);
            const mine = part.side === "right";
            // tail shows on the first message of a consecutive same-sender run
            const prev = tl.events[i - 1]?.message;
            const firstOfRun = !prev || prev.participantId !== m.participantId;
            const style = entryStyle(m.animation, progress);
            if (mine) {
              return (
                <div className="msg-row-me" key={m.id} style={style}>
                  <div className="bubble bubble-me">
                    {firstOfRun && <div className="tail-me"><TailMe /></div>}
                    <span className="bubble-text">{m.text}</span>
                    <div className="ts">{m.timestamp || ""} {m.readReceipt && <div className="check"><CheckTick /></div>}</div>
                  </div>
                </div>
              );
            }
            return (
              <div className="msg-row-them" key={m.id} style={style}>
                <div className="avatar-wrap">
                  <div className="bubble bubble-them">
                    {firstOfRun && <div className="tail-them"><TailThem /></div>}
                    <span className="bubble-text">{m.text}</span>
                    <div className="ts">{m.timestamp || ""}</div>
                  </div>
                </div>
              </div>
            );
          })}

          {typingEv && typingPart?.side === "left" && (
            <div className="msg-row-them">
              <div className="avatar-wrap">
                <div className="typing-bubble">
                  <div className="tail-them"><TailThem /></div>
                  <TypingDots frame={frame} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="status-bar">
        <span className="status-time">9:41</span>
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
                <span className="contact-sub">{sub}</span>
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
