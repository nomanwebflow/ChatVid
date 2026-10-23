import { useEffect, useMemo, useState } from "react";
import type { Project, Message } from "./types";
import { uid } from "./types";
import { parseConversation } from "./parseImport";
import { X, TriangleAlert } from "lucide-react";

const SAMPLE = `Alex: Hey, are you free today?
You: Yes! What's up?
Alex: I have an idea for you.
You: Tell me more.`;

type Props = {
  project: Project;
  onClose: () => void;
  onImport: (messages: Message[]) => void;
};

// Map each recognized speaker to a participant id (or __new__ to create one).
export function ImportDialog({ project, onClose, onImport }: Props) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseConversation> | null>(null);
  // per-line sender override (participant id)
  const [lineSender, setLineSender] = useState<Record<number, string>>({});
  // mapping from detected speaker name -> participant id
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});

  const rightId = project.participants.find((p) => p.side === "right")?.id || project.participants[0].id;
  const leftId = project.participants.find((p) => p.side === "left")?.id || project.participants[0].id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function doParse() {
    const r = parseConversation(raw.trim() ? raw : SAMPLE);
    setParsed(r);
    // default: first speaker -> left, "You"/"Me" -> right, others -> left
    const map: Record<string, string> = {};
    r.speakers.forEach((sp, i) => {
      if (/^(you|me)$/i.test(sp)) map[sp] = rightId;
      else map[sp] = i === 0 ? leftId : leftId;
    });
    setSpeakerMap(map);
    setLineSender({});
  }

  const resolved = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.map((l, i) => {
      const sender = lineSender[i] ?? (l.speaker ? speakerMap[l.speaker] : leftId) ?? leftId;
      return { ...l, i, sender };
    });
  }, [parsed, lineSender, speakerMap, leftId]);

  // format minutes-since-midnight as a 12-hour clock, e.g. 125 -> "2:05 AM"
  function fmtClock(mins: number): string {
    const m = ((mins % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60), min = m % 60;
    const ap = h24 < 12 ? "AM" : "PM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${String(min).padStart(2, "0")} ${ap}`;
  }

  function commit() {
    // auto-timestamps when a message has none: start randomly in the 12am–3am
    // window, then step forward 0–3 min per message so the night progresses.
    let clock = Math.floor(Math.random() * 180); // 0..179 min after midnight
    const msgs: Message[] = resolved.map((l, idx) => {
      const isMe = project.participants.find((p) => p.id === l.sender)?.side === "right";
      let stamp = l.time;
      if (!stamp) {
        if (idx > 0) clock += Math.floor(Math.random() * 4); // +0..3 min
        stamp = fmtClock(clock);
      }
      return {
        id: uid(), participantId: l.sender, text: l.text, order: idx,
        timestamp: stamp,
        delayMs: isMe ? 650 : 0, readingDurationMs: isMe ? 450 : 1200,
        animation: "pop", animationDurationMs: 280, typingDurationMs: isMe ? 0 : 1400,
        readReceipt: isMe,
      };
    });
    onImport(msgs);
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Paste conversation</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="dialog-body">
          {!parsed ? (
            <>
              <textarea autoFocus placeholder={SAMPLE} value={raw} onChange={(e) => setRaw(e.target.value)} />
              <p className="hint">Format: <code>Speaker: message</code>, one per line. A leading timestamp is kept per message — e.g. <code>[9:45 PM] Sara: hi</code> or <code>9:45 PM - Sara: hi</code>. Without one, late-night times (12–3 AM) are generated automatically. Multiline messages and emojis are preserved. Pasted text is treated as plain text — nothing is sent anywhere.</p>
            </>
          ) : (
            <>
              <p className="hint">{parsed.messageCount} message(s) detected · {parsed.speakers.length} speaker(s). Review sender assignment, then import.</p>
              {parsed.warnings.map((w, i) => <p className="warn" key={i}><TriangleAlert size={13} /> {w}</p>)}
              <div className="parse-list">
                {resolved.map((l) => (
                  <div className={`parse-row ${l.ambiguous ? "amb" : ""}`} key={l.i}>
                    <select value={l.sender} onChange={(e) => setLineSender((s) => ({ ...s, [l.i]: e.target.value }))} aria-label="Sender">
                      {project.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <span className="pt" title={l.text}>{l.text || <em>(blank)</em>}</span>
                    {l.time && <span className="pt-time">{l.time}</span>}
                    {l.ambiguous && <span style={{ fontSize: 11, color: "#9a5a12" }}>no speaker</span>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="dialog-foot">
          {parsed ? (
            <>
              <button className="tb-btn" onClick={() => setParsed(null)}>Back</button>
              <button className="tb-btn primary" onClick={commit} disabled={!resolved.length}>Import {resolved.length} message(s)</button>
            </>
          ) : (
            <>
              <button className="tb-btn" onClick={onClose}>Cancel</button>
              <button className="tb-btn primary" onClick={doParse}>Parse conversation</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
