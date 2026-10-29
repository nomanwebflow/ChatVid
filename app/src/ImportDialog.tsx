import { useEffect, useMemo, useState } from "react";
import type { Project, Message, Participant } from "./types";
import { uid } from "./types";
import { parseConversation } from "./parseImport";
import { X, TriangleAlert, ArrowLeftRight } from "lucide-react";

const SAMPLE = `Alex: Hey, are you free today?
You: Yes! What's up?
Alex: I have an idea for you.
You: Tell me more.`;

const PALETTE = ["#0a6b3b", "#2575ff", "#e17055", "#6c5ce7", "#fdcb6e", "#00cec9"];

type Props = {
  project: Project;
  onClose: () => void;
  onImport: (messages: Message[], participants?: Participant[], newContactName?: string) => void;
};

// Map each recognized speaker to a participant id (or new participants with script names).
export function ImportDialog({ project, onClose, onImport }: Props) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ReturnType<typeof parseConversation> | null>(null);
  // Whether Left and Right sides are swapped
  const [swapped, setSwapped] = useState(false);
  // Whether to update project participant names with detected speaker names
  const [updateNames, setUpdateNames] = useState(true);
  // Manual speaker -> participant id override
  const [speakerMapOverride, setSpeakerMapOverride] = useState<Record<string, string>>({});
  // Per-line sender override (participant id)
  const [lineSender, setLineSender] = useState<Record<number, string>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function doParse() {
    const r = parseConversation(raw.trim() ? raw : SAMPLE);
    setParsed(r);
    setSwapped(false);
    setUpdateNames(true);
    setSpeakerMapOverride({});
    setLineSender({});
  }

  // Derive participants and default speaker assignment based on detected speakers
  const { currentParticipants, defaultSpeakerMap } = useMemo(() => {
    const origThem = project.participants.find((p) => p.side === "left") || project.participants[0];
    const origMe = project.participants.find((p) => p.side === "right" && p.id !== origThem.id) ||
      project.participants[1] || {
        id: uid(),
        name: "You",
        side: "right" as const,
        color: "#2575ff",
      };

    if (!parsed || parsed.speakers.length === 0) {
      return {
        currentParticipants: project.participants,
        defaultSpeakerMap: {} as Record<string, string>,
      };
    }

    const sps = parsed.speakers;
    let spLeft = "";
    let spRight = "";
    const extraSpeakers: string[] = [];

    if (sps.length === 1) {
      if (/^(you|me)$/i.test(sps[0])) {
        spRight = sps[0];
      } else {
        spLeft = sps[0];
      }
    } else {
      const is0Me = /^(you|me)$/i.test(sps[0]);
      const is1Me = /^(you|me)$/i.test(sps[1]);
      if (is0Me && !is1Me) {
        spRight = sps[0];
        spLeft = sps[1];
      } else if (is1Me && !is0Me) {
        spLeft = sps[0];
        spRight = sps[1];
      } else {
        spLeft = sps[0];
        spRight = sps[1];
      }
      for (let i = 2; i < sps.length; i++) {
        extraSpeakers.push(sps[i]);
      }
    }

    if (swapped && spLeft && spRight) {
      const tmp = spLeft;
      spLeft = spRight;
      spRight = tmp;
    }

    const newParts: Participant[] = [];
    const defMap: Record<string, string> = {};

    // Left participant (Them)
    const leftName = updateNames && spLeft ? spLeft : origThem.name;
    const leftPart: Participant = {
      ...origThem,
      name: leftName,
      side: "left",
    };
    newParts.push(leftPart);
    if (spLeft) defMap[spLeft] = leftPart.id;

    // Right participant (You / Me)
    const rightName = updateNames && spRight
      ? (/^(you|me)$/i.test(spRight) ? "You" : spRight)
      : origMe.name;
    const rightPart: Participant = {
      ...origMe,
      name: rightName,
      side: "right",
    };
    newParts.push(rightPart);
    if (spRight) defMap[spRight] = rightPart.id;

    // Any additional speakers (3 or more)
    extraSpeakers.forEach((sp, idx) => {
      const existing = project.participants[idx + 2];
      const partName = updateNames ? sp : (existing?.name || sp);
      const part: Participant = existing
        ? { ...existing, name: partName, side: "left" }
        : {
            id: uid(),
            name: partName,
            side: "left",
            color: PALETTE[(idx + 2) % PALETTE.length],
          };
      newParts.push(part);
      defMap[sp] = part.id;
    });

    return { currentParticipants: newParts, defaultSpeakerMap: defMap };
  }, [project.participants, parsed, swapped, updateNames]);

  const speakerMap = useMemo(() => ({
    ...defaultSpeakerMap,
    ...speakerMapOverride,
  }), [defaultSpeakerMap, speakerMapOverride]);

  const leftId = currentParticipants.find((p) => p.side === "left")?.id || currentParticipants[0].id;

  const resolved = useMemo(() => {
    if (!parsed) return [];
    return parsed.lines.map((l, i) => {
      const sender = lineSender[i] ?? (l.speaker ? speakerMap[l.speaker] : leftId) ?? leftId;
      return { ...l, i, sender };
    });
  }, [parsed, lineSender, speakerMap, leftId]);

  function handleSwap() {
    setSwapped((s) => !s);
    setSpeakerMapOverride({});
    setLineSender({});
  }

  function commit() {
    // Only times that were in the pasted text are stored. Messages without one are left
    // blank on purpose: they follow the first message's time automatically (see autoStamps),
    // so changing the first time later moves the whole chat with it.
    const msgs: Message[] = resolved.map((l, idx) => {
      const isMe = currentParticipants.find((p) => p.id === l.sender)?.side === "right";
      return {
        id: uid(), participantId: l.sender, text: l.text, order: idx,
        timestamp: l.time || undefined,
        delayMs: isMe ? 650 : 0, readingDurationMs: isMe ? 450 : 1200,
        animation: "pop", animationDurationMs: 280, typingDurationMs: isMe ? 0 : 1400,
        readReceipt: isMe,
      };
    });

    const leftPart = currentParticipants.find((p) => p.side === "left") || currentParticipants[0];
    const newContactName = updateNames ? leftPart?.name : undefined;

    onImport(msgs, updateNames ? currentParticipants : undefined, newContactName);
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
              <p className="hint">Format: <code>Speaker: message</code>, one per line. A leading timestamp is kept per message — e.g. <code>[9:45 PM] Sara: hi</code> or <code>9:45 PM - Sara: hi</code>. Messages without a time follow the first message's time automatically (a random 12–3 AM start if none has one). Multiline messages and emojis are preserved. Pasted text is treated as plain text — nothing is sent anywhere.</p>
            </>
          ) : (
            <>
              <p className="hint">{parsed.messageCount} message(s) detected · {parsed.speakers.length} speaker(s). Review sender assignment, then import.</p>
              {parsed.warnings.map((w, i) => <p className="warn" key={i}><TriangleAlert size={13} /> {w}</p>)}

              {parsed.speakers.length > 0 && (
                <div className="speaker-map-card">
                  <div className="speaker-map-header">
                    <span className="speaker-map-title">Speaker assignment</span>
                    {parsed.speakers.length === 2 && (
                      <button
                        type="button"
                        className="tb-btn swap-sides-btn"
                        onClick={handleSwap}
                        title="Swap Left (Them) and Right (You) sides"
                      >
                        <ArrowLeftRight size={13} />
                        <span>Swap sides</span>
                      </button>
                    )}
                  </div>
                  <div className="speaker-map-grid">
                    {parsed.speakers.map((sp) => (
                      <div className="speaker-map-row" key={sp}>
                        <span className="speaker-name" title={sp}>{sp}</span>
                        <span className="speaker-arrow">→</span>
                        <select
                          value={speakerMap[sp] || ""}
                          onChange={(e) => setSpeakerMapOverride((prev) => ({ ...prev, [sp]: e.target.value }))}
                          aria-label={`Participant for ${sp}`}
                        >
                          {currentParticipants.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.side === "right" ? "You · Right" : "Them · Left"})
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  <label className="speaker-rename-toggle">
                    <input
                      type="checkbox"
                      checked={updateNames}
                      onChange={(e) => setUpdateNames(e.target.checked)}
                    />
                    <span>Update project participant names to match script</span>
                  </label>
                </div>
              )}

              <div className="parse-list">
                {resolved.map((l) => (
                  <div className={`parse-row ${l.ambiguous ? "amb" : ""}`} key={l.i}>
                    <select
                      value={l.sender}
                      onChange={(e) => setLineSender((s) => ({ ...s, [l.i]: e.target.value }))}
                      aria-label="Sender"
                    >
                      {currentParticipants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.side === "right" ? "You" : "Them"})
                        </option>
                      ))}
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
              <button className="tb-btn primary commit-import-btn" onClick={commit} disabled={!resolved.length}>Import {resolved.length} message(s)</button>
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
