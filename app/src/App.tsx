import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ChatComposition } from "./composition/ChatComposition";
import { avatarDataUri } from "./composition/svg";
import type { Project, Message, EntryAnimation } from "./types";
import {
  Undo2, Redo2, ClipboardPaste, RotateCcw, Download, Plus, Copy, Trash2, GripVertical, Ellipsis, CheckCheck,
  Play, Pause, SkipBack, Smartphone, Maximize2, Upload, ListOrdered, SlidersHorizontal, MessageSquarePlus,
} from "lucide-react";
import { FPS, uid } from "./types";
import { createSampleProject } from "./sampleProject";
import { buildTimeline, framesToSeconds, currentEventIndex } from "./timeline";
import { saveProject, loadProject } from "./db";
import { ImportDialog } from "./ImportDialog";
import { ExportDialog } from "./ExportDialog";
import { EditorTimeline } from "./TimelineEditor";
import "./editor.css";

// ── undo/redo reducer ──
type State = { past: Project[]; project: Project; future: Project[] };
type Action =
  | { t: "set"; p: Project; squash?: boolean }
  | { t: "undo" }
  | { t: "redo" }
  | { t: "load"; p: Project };

const touch = (p: Project): Project => ({ ...p, updatedAt: new Date().toISOString() });

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case "set": {
      // squash = collapse rapid same-kind edits (text typing) into one history entry
      const past = a.squash && s.past.length ? s.past : [...s.past, s.project];
      return { past: past.slice(-50), project: touch(a.p), future: [] };
    }
    case "undo": {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), project: prev, future: [s.project, ...s.future] };
    }
    case "redo": {
      if (!s.future.length) return s;
      const next = s.future[0];
      return { past: [...s.past, s.project], project: next, future: s.future.slice(1) };
    }
    case "load":
      return { past: [], project: a.p, future: [] };
  }
}

const PROJECT_KEY = "chat-reel:lastId";

// Icons: Lucide everywhere in the editor chrome (stroke weight is set once in editor.css).
const IC = 15;

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const p = createSampleProject();
    return { past: [], project: p, future: [] };
  });
  const project = state.project;
  const [selId, setSelId] = useState<string | null>(project.messages[0]?.id ?? null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [mobileTab, setMobileTab] = useState<"list" | "preview" | "props">("preview");
  const playerRef = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  // drag-to-reorder state for the message list
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // preview stage sizing: fit the 9:16 player into the available area.
  const stageRef = useRef<HTMLDivElement>(null);
  const [playerSize, setPlayerSize] = useState({ w: 300, h: 533 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      // clientWidth/Height already exclude the element's padding box content area,
      // so the player can never exceed the stage and spill under the toolbar.
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      // fill height first, fall back to width if too wide
      let h = availH;
      let w = (h * 9) / 16;
      if (w > availW) { w = availW; h = (w * 16) / 9; }
      setPlayerSize({ w: Math.round(w), h: Math.round(h) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    // also refit once layout fully settles
    const r = requestAnimationFrame(fit);
    return () => { ro.disconnect(); cancelAnimationFrame(r); };
  }, []);

  const tl = useMemo(() => buildTimeline(project), [project]);
  const totalFrames = tl.totalFrames;

  // ── load last project from IndexedDB on mount ──
  useEffect(() => {
    const last = localStorage.getItem(PROJECT_KEY);
    if (last) loadProject(last).then((p) => { if (p) { dispatch({ t: "load", p }); setSelId(p.messages[0]?.id ?? null); } });
  }, []);

  // ── autosave (debounced) ──
  useEffect(() => {
    setSaveState("dirty");
    const h = setTimeout(async () => {
      setSaveState("saving");
      await saveProject(project);
      localStorage.setItem(PROJECT_KEY, project.id);
      setSaveState("saved");
    }, 600);
    return () => clearTimeout(h);
  }, [project]);

  // ── keyboard: undo/redo ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ t: e.shiftKey ? "redo" : "undo" }); }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); dispatch({ t: "redo" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── player frame polling ──
  useEffect(() => {
    const pr = playerRef.current;
    if (!pr) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    pr.addEventListener("frameupdate", onFrame);
    pr.addEventListener("play", onPlay);
    pr.addEventListener("pause", onPause);
    return () => { pr.removeEventListener("frameupdate", onFrame); pr.removeEventListener("play", onPlay); pr.removeEventListener("pause", onPause); };
  }, []);

  const setProject = useCallback((p: Project, squash = false) => dispatch({ t: "set", p, squash }), []);

  // ── message ops ──
  const ordered = useMemo(() => [...project.messages].sort((a, b) => a.order - b.order), [project.messages]);
  const sel = ordered.find((m) => m.id === selId) || null;

  // keep the selected row visible in the list (e.g. after Add message)
  useEffect(() => {
    if (selId) document.querySelector(".msg-item.sel")?.scrollIntoView({ block: "nearest" });
  }, [selId, ordered.length]);

  function updateMessage(id: string, patch: Partial<Message>, squash = false) {
    setProject({ ...project, messages: project.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, squash);
  }
  function reindex(list: Message[]): Message[] { return list.map((m, i) => ({ ...m, order: i })); }

  function addMessage() {
    const idx = sel ? ordered.findIndex((m) => m.id === sel.id) : ordered.length - 1;
    const prev = ordered[idx];
    // default to the opposite sender of the previous message
    const otherSide = prev ? (project.participants.find((p) => p.id === prev.participantId)?.side === "right" ? "left" : "right") : "right";
    const part = project.participants.find((p) => p.side === otherSide) || project.participants[0];
    const isMe = part.side === "right";
    const nm: Message = {
      id: uid(), participantId: part.id, text: "New message", order: 0,
      delayMs: isMe ? 650 : 0, readingDurationMs: isMe ? 450 : 1200,
      animation: "pop", animationDurationMs: 280, typingDurationMs: isMe ? 0 : 1400,
      readReceipt: isMe,
    };
    const list = [...ordered];
    list.splice(idx + 1, 0, nm);
    setProject({ ...project, messages: reindex(list) });
    setSelId(nm.id);
  }
  function deleteMessage(id: string) {
    const list = reindex(ordered.filter((m) => m.id !== id));
    setProject({ ...project, messages: list });
    if (selId === id) setSelId(list[0]?.id ?? null);
  }
  function duplicateMessage(id: string) {
    const idx = ordered.findIndex((m) => m.id === id);
    const copy: Message = { ...ordered[idx], id: uid() };
    const list = [...ordered]; list.splice(idx + 1, 0, copy);
    setProject({ ...project, messages: reindex(list) });
    setSelId(copy.id);
  }
  function move(id: string, dir: -1 | 1) {
    const idx = ordered.findIndex((m) => m.id === id);
    const j = idx + dir;
    if (j < 0 || j >= ordered.length) return;
    const list = [...ordered];
    [list[idx], list[j]] = [list[j], list[idx]];
    setProject({ ...project, messages: reindex(list) });
  }

  // drag-and-drop: move `id` so it takes the position of `targetId`
  function moveTo(id: string, targetId: string) {
    const from = ordered.findIndex((m) => m.id === id);
    const to = ordered.findIndex((m) => m.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const list = [...ordered];
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    setProject({ ...project, messages: reindex(list) });
  }

  function resetProject() {
    if (!confirm("Reset to the sample conversation? This clears your current edits.")) return;
    const p = createSampleProject();
    setProject(p);
    setSelId(p.messages[0]?.id ?? null);
  }

  // ── preview controls ──
  const play = () => playerRef.current?.play();
  const pause = () => playerRef.current?.pause();
  const toggle = () => (playing ? pause() : play());
  const restart = () => { playerRef.current?.seekTo(0); };
  const seek = (f: number) => playerRef.current?.seekTo(f);

  // selecting a message seeks to its reveal; current frame highlights a message
  function selectAndSeek(m: Message) {
    setSelId(m.id);
    const ev = tl.events.find((e) => e.message.id === m.id);
    if (ev) seek(ev.revealStart);
  }
  const curIdx = currentEventIndex(tl, frame);
  const curId = tl.events[curIdx]?.message.id;

  const fmt = (f: number) => {
    const s = framesToSeconds(f);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 10))}`;
  };

  const partColor = (id: string) => project.participants.find((p) => p.id === id)?.color || "#888";
  const partName = (id: string) => project.participants.find((p) => p.id === id)?.name || "?";


  return (
    <div className="app">
      {/* toolbar */}
      <div className="toolbar">
        <div className="brand"><span className="dot" /> ChatVid</div>
        <input className="title-input" aria-label="Project name" value={project.title}
          onChange={(e) => setProject({ ...project, title: e.target.value }, true)} />
        <button className="tb-btn" onClick={() => dispatch({ t: "undo" })} disabled={!state.past.length} title="Undo (⌘Z)" aria-label="Undo"><Undo2 size={IC} /> <span className="lbl">Undo</span></button>
        <button className="tb-btn" onClick={() => dispatch({ t: "redo" })} disabled={!state.future.length} title="Redo (⌘⇧Z)" aria-label="Redo"><Redo2 size={IC} /> <span className="lbl">Redo</span></button>
        <button className="tb-btn" onClick={() => setImportOpen(true)}><ClipboardPaste size={IC} /> Paste import</button>
        <button className="tb-btn" onClick={resetProject}><RotateCcw size={IC} /> Reset</button>
        <div className="tb-spacer" />
        <span className="save-state">{saveState === "saved" ? "All changes saved" : saveState === "saving" ? "Saving…" : "Unsaved"}</span>
        <button className="tb-btn primary" onClick={() => setExportOpen(true)}><Download size={IC} /> Export</button>
      </div>

      <div className="workspace">
        {/* message list */}
        <div className={`panel left ${mobileTab === "list" ? "active" : ""}`}>
          <div className="panel-head"><h2>Messages</h2><span className="count">{ordered.length}</span></div>
          <div className="panel-body">
            {ordered.length === 0 && (
              <div className="empty-list">
                <MessageSquarePlus size={26} />
                <p>No messages yet</p>
                <button className="tb-btn" onClick={addMessage}>Add the first message</button>
              </div>
            )}
            {ordered.map((m) => {
              const part = project.participants.find((p) => p.id === m.participantId);
              const isMe = part?.side === "right";
              const cls = ["msg-item", isMe ? "me" : "", selId === m.id ? "sel" : "", curId === m.id && playing ? "cur" : "",
                overId === m.id && dragId && dragId !== m.id ? "drop" : "", dragId === m.id ? "dragging" : ""].join(" ");
              return (
                <div key={m.id} className={cls} role="button" tabIndex={0} draggable
                  aria-label={`${part?.name ?? "?"}: ${m.text || "empty message"}`} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Delete"
                  onClick={() => selectAndSeek(m)}
                  onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", m.id); }}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(m.id); } }}
                  onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, m.id); setDragId(null); setOverId(null); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const el = e.currentTarget;
                    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(m.id, e.key === "ArrowUp" ? -1 : 1); return; }
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectAndSeek(m); }
                    else if (e.key === "ArrowDown") { e.preventDefault(); (el.nextElementSibling as HTMLElement | null)?.focus(); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); (el.previousElementSibling as HTMLElement | null)?.focus(); }
                    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteMessage(m.id); }
                  }}>
                  <span className="msg-grip" aria-hidden="true" title="Drag to reorder"><GripVertical size={14} /></span>
                  <span className="msg-av" style={{ background: partColor(m.participantId) }} aria-hidden="true">{partName(m.participantId).charAt(0).toUpperCase()}</span>
                  <div className="msg-main">
                    <div className="msg-text">{m.text || <em>Empty message</em>}</div>
                    <div className="msg-meta">
                      <span className="msg-who">{partName(m.participantId)}</span>
                      {m.typingDurationMs > 0 && (
                        <span className="meta-chip" title={`Shows a typing indicator for ${(m.typingDurationMs / 1000).toFixed(1)}s`}><Ellipsis size={12} />{(m.typingDurationMs / 1000).toFixed(1)}s</span>
                      )}
                      {m.readReceipt && <span className="meta-chip" title="Read receipt (ticks)"><CheckCheck size={12} /></span>}
                    </div>
                  </div>
                  <div className="msg-actions">
                    <button className="icon-btn" title="Duplicate" aria-label="Duplicate message" onClick={(e) => { e.stopPropagation(); duplicateMessage(m.id); }}><Copy size={IC} /></button>
                    <button className="icon-btn danger" title="Delete (Del)" aria-label="Delete message" onClick={(e) => { e.stopPropagation(); deleteMessage(m.id); }}><Trash2 size={IC} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="add-row"><button className="tb-btn" onClick={addMessage}><Plus size={IC} /> Add message</button></div>
        </div>

        {/* preview */}
        <div className={`panel preview ${mobileTab === "preview" ? "active" : ""}`} style={{ background: undefined }}>
          <div className="layout-toggle">
            <button className={project.appearance.layout === "phone" ? "on" : ""} aria-pressed={project.appearance.layout === "phone"} onClick={() => setProject({ ...project, appearance: { ...project.appearance, layout: "phone" } })}><Smartphone size={13} /> Phone</button>
            <button className={project.appearance.layout === "fullscreen" ? "on" : ""} aria-pressed={project.appearance.layout === "fullscreen"} onClick={() => setProject({ ...project, appearance: { ...project.appearance, layout: "fullscreen" } })}><Maximize2 size={13} /> Full screen</button>
          </div>
          <div className="preview-stage" ref={stageRef} style={{ background: project.appearance.sceneBackground || "#e9ede7" }}>
            <div className="player-wrap" style={{ width: playerSize.w, height: playerSize.h }}>
              <Player
                ref={playerRef}
                component={ChatComposition as any}
                inputProps={{ project }}
                durationInFrames={totalFrames}
                compositionWidth={1080}
                compositionHeight={1920}
                fps={FPS}
                style={{ width: playerSize.w, height: playerSize.h }}
                loop
                playbackRate={speed}
                acknowledgeRemotionLicense
              />
            </div>
          </div>
          <div className="preview-controls">
            <button className="pc-btn" onClick={restart} title="Restart" aria-label="Restart"><SkipBack size={16} /></button>
            <button className="pc-btn" onClick={toggle} title={playing ? "Pause" : "Play"} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={16} /> : <Play size={16} />}</button>
            <input className="pc-seek" type="range" min={0} max={totalFrames - 1} value={Math.min(frame, totalFrames - 1)}
              aria-label="Seek" onChange={(e) => seek(Number(e.target.value))} />
            <span className="pc-time">{fmt(frame)} / {fmt(totalFrames)}</span>
            <select className="pc-speed" aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option>
            </select>
          </div>
        </div>

        {/* properties */}
        <div className={`panel right ${mobileTab === "props" ? "active" : ""}`}>
          <div className="panel-head"><h2>{sel ? "Message" : "Appearance"}</h2></div>
          <div className="panel-body">
            {sel ? <MessageProps key={sel.id} m={sel} project={project} onChange={updateMessage} /> : null}
            {!sel && <div className="empty">Select a message to edit its text and timing.</div>}
            <hr className="sep" />
            <AppearanceProps project={project} onChange={setProject} />
          </div>
        </div>
      </div>

      {/* proper editing timeline (premade component) */}
      <EditorTimeline
        project={project}
        tl={tl}
        frame={frame}
        totalFrames={totalFrames}
        playing={playing}
        selId={selId}
        curId={curId}
        onSelect={selectAndSeek}
        onSeek={seek}
        onPlayToggle={toggle}
        onRestart={restart}
        onUpdateMessage={updateMessage}
        onAddMessage={addMessage}
      />

      {/* mobile tabs */}
      <div className="tabbar">
        <button className={mobileTab === "list" ? "on" : ""} onClick={() => setMobileTab("list")}><ListOrdered size={18} />Messages</button>
        <button className={mobileTab === "preview" ? "on" : ""} onClick={() => setMobileTab("preview")}><Play size={18} />Preview</button>
        <button className={mobileTab === "props" ? "on" : ""} onClick={() => setMobileTab("props")}><SlidersHorizontal size={18} />Properties</button>
      </div>

      {importOpen && (
        <ImportDialog
          project={project}
          onClose={() => setImportOpen(false)}
          onImport={(msgs) => { setProject({ ...project, messages: msgs }); setSelId(msgs[0]?.id ?? null); setImportOpen(false); }}
        />
      )}

      {exportOpen && (
        <ExportDialog project={project} totalFrames={totalFrames} onClose={() => setExportOpen(false)} />
      )}
    </div>
  );
}

// ── message properties panel ──
function MessageProps({ m, project, onChange }: { m: Message; project: Project; onChange: (id: string, p: Partial<Message>, squash?: boolean) => void }) {
  const num = (v: number) => (Number.isFinite(v) && v >= 0 ? v : 0);
  return (
    <>
      <div className="field">
        <label htmlFor="mtext">Message text</label>
        <textarea id="mtext" value={m.text} onChange={(e) => onChange(m.id, { text: e.target.value }, true)} />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="msender">Sender</label>
          <select id="msender" value={m.participantId} onChange={(e) => onChange(m.id, { participantId: e.target.value })}>
            {project.participants.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.side})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="manim">Entry animation</label>
          <select id="manim" value={m.animation} onChange={(e) => onChange(m.id, { animation: e.target.value as EntryAnimation })}>
            <option value="instant">Instant</option><option value="fade">Fade</option><option value="slide">Slide</option><option value="pop">Pop</option>
          </select>
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="mdelay">Delay before (s)</label>
          <input id="mdelay" type="number" min={0} step={0.1} value={m.delayMs / 1000}
            onChange={(e) => onChange(m.id, { delayMs: num(Number(e.target.value)) * 1000 })} />
        </div>
        <div className="field">
          <label htmlFor="mread">Reading pause (s)</label>
          <input id="mread" type="number" min={0} step={0.1} value={m.readingDurationMs / 1000}
            onChange={(e) => onChange(m.id, { readingDurationMs: num(Number(e.target.value)) * 1000 })} />
        </div>
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="manimd">Anim duration (s)</label>
          <input id="manimd" type="number" min={0} step={0.05} value={m.animationDurationMs / 1000}
            onChange={(e) => onChange(m.id, { animationDurationMs: num(Number(e.target.value)) * 1000 })} />
        </div>
        <div className="field">
          <label htmlFor="mtype">Typing time (s)</label>
          <input id="mtype" type="number" min={0} step={0.1} value={m.typingDurationMs / 1000}
            onChange={(e) => onChange(m.id, { typingDurationMs: num(Number(e.target.value)) * 1000 })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="mts">Timestamp</label>
        <input id="mts" type="text" placeholder="10:14" value={m.timestamp || ""} onChange={(e) => onChange(m.id, { timestamp: e.target.value }, true)} />
      </div>
      <div className="toggle-row">
        <span>Read receipt (sent/read ticks)</span>
        <button className={`switch ${m.readReceipt ? "on" : ""}`} aria-pressed={m.readReceipt} aria-label="Read receipt"
          onClick={() => onChange(m.id, { readReceipt: !m.readReceipt })} />
      </div>
    </>
  );
}

// ── appearance panel ──
function AppearanceProps({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const a = project.appearance;
  const set = (patch: Partial<typeof a>) => onChange({ ...project, appearance: { ...a, ...patch } });
  const them = project.participants.find((p) => p.side === "left") || project.participants[0];
  const setThemAvatar = (url: string | undefined) =>
    onChange({ ...project, participants: project.participants.map((p) => (p.id === them.id ? { ...p, avatarUrl: url } : p)) });

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setThemAvatar(String(reader.result)); // data URL, stays local
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file
  }

  return (
    <>
      <div className="field">
        <label>Profile photo</label>
        <div className="avatar-edit">
          <img className="avatar-preview" alt="Contact avatar"
            src={them.avatarUrl || avatarDataUri(them.color)} />
          <div className="avatar-actions">
            <label className="tb-btn file-btn">
              <Upload size={IC} /> Upload…
              <input type="file" accept="image/*" onChange={onPhoto} hidden />
            </label>
            {them.avatarUrl && (
              <button className="tb-btn" onClick={() => setThemAvatar(undefined)}>Remove</button>
            )}
          </div>
        </div>
      </div>
      <div className="field">
        <label htmlFor="cname">Contact name</label>
        <input id="cname" type="text" value={a.contactName} onChange={(e) => set({ contactName: e.target.value })} />
      </div>
      <div className="row2">
        <div className="field">
          <label htmlFor="csub">Status text</label>
          <input id="csub" type="text" value={a.contactSub} onChange={(e) => set({ contactSub: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="chold">End hold (s)</label>
          <input id="chold" type="number" min={0} step={0.1} value={a.endHoldMs / 1000}
            onChange={(e) => set({ endHoldMs: Math.max(0, Number(e.target.value)) * 1000 })} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cwall">Chat wallpaper</label>
        <select id="cwall" value={a.wallpaperUrl || ""} onChange={(e) => set({ wallpaperUrl: e.target.value || undefined })}>
          <option value="wa-bg.webp">WhatsApp doodles</option>
          <option value="">None (plain)</option>
        </select>
      </div>

      <div className="field">
        <label>Scene background <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(behind phone)</span></label>
        <div className="swatches">
          {SCENE_PRESETS.map((bg) => (
            <button key={bg} className={`swatch ${a.sceneBackground === bg ? "on" : ""}`}
              title={bg} style={{ background: bg }} aria-label={`Background ${bg}`}
              onClick={() => set({ sceneBackground: bg })} />
          ))}
        </div>
        <div className="scene-custom">
          <input type="color" aria-label="Custom background color"
            value={/^#[0-9a-fA-F]{6}$/.test(a.sceneBackground) ? a.sceneBackground : "#e9ede7"}
            onChange={(e) => set({ sceneBackground: e.target.value })} />
          <input type="text" aria-label="Background CSS" value={a.sceneBackground || "#e9ede7"}
            onChange={(e) => set({ sceneBackground: e.target.value })} />
        </div>
      </div>
    </>
  );
}

const SCENE_PRESETS = [
  "#e9ede7", "#ffffff", "#0c0e12", "#111827", "#f3e9dd", "#ead7c3",
  "linear-gradient(160deg,#dbeafe,#ede9fe)",
  "linear-gradient(160deg,#fde68a,#fca5a5)",
  "linear-gradient(160deg,#a7f3d0,#6ee7b7)",
  "linear-gradient(160deg,#1e293b,#0f172a)",
];
