import { useEffect, useMemo, useReducer, useRef, useState, useCallback } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { ChatComposition } from "./composition/ChatComposition";
import { avatarDataUri } from "./composition/svg";
import type { Project, Message, EntryAnimation, Participant, ImageAttachment } from "./types";
import {
  Undo2, Redo2, ClipboardPaste, RotateCcw, Download, Plus, Copy, Trash2, GripVertical, Ellipsis, CheckCheck,
  Play, Pause, SkipBack, Smartphone, Maximize2, Upload, ListOrdered, SlidersHorizontal, MessageSquarePlus,
  Pencil, Check, ChevronDown, Loader2, TriangleAlert, X, Mic, ImagePlus, Image as ImageIcon, FolderKanban,
} from "lucide-react";
import { useQuery, useMutation, useConvex } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { offloadMedia } from "./cloudMedia";
import { api } from "../convex/_generated/api";
import { AuthModal } from "./AuthModal";
import { ConnectDialog } from "./ConnectDialog";
import { UserMenu } from "./UserMenu";
import { ProjectsModal } from "./ProjectsModal";
import { VoicePanel } from "./VoicePanel";
import { ImagePanel } from "./ImagePanel";
import { IMAGE_ACCEPT, imageFromFile } from "./image";
import { fmtVoiceTime } from "./voice";
import { FPS, uid } from "./types";
import { createSampleProject } from "./sampleProject";
import { buildTimeline, framesToSeconds, currentEventIndex, autoStamps } from "./timeline";
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
  const [isExporting, setIsExporting] = useState(false);
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [dismissDesktopNotice, setDismissDesktopNotice] = useState(false);
  const [toasts, setToasts] = useState<{ id: string; message: string; type?: "info" | "success" | "error" }[]>([]);

  const showToast = useCallback((message: string, type: "info" | "success" | "error" = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);
  const playerRef = useRef<PlayerRef>(null);
  // set while a single voice note is being played from its bubble: pause when it ends
  const voiceStopRef = useRef<number | null>(null);
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
      // Center the phone with equal breathing room: 80px vertical clearance (prevents
      // touching the top edge or the bottom floating playback pill), and 48px horizontal.
      const availW = Math.max(120, el.clientWidth - 48);
      const availH = Math.max(200, el.clientHeight - 84);
      if (availW <= 0 || availH <= 0) return;
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

  // ── Convex multi-user Auth & Cloud DB ──
  const viewer = useQuery(api.users.viewer);
  const saveProjectToConvex = useMutation(api.projects.save);
  const convex = useConvex();
  const authToken = useAuthToken();

  // OAuth consent for the MCP connector (/?connect=1&redirect_uri=...): needs a real account
  const [connectParams, setConnectParams] = useState<URLSearchParams | null>(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("connect") === "1" && q.get("redirect_uri") ? q : null;
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signIn" | "signUp">("signIn");
  const [projectsOpen, setProjectsOpen] = useState(false);

  // ── load project on mount: check URL ?project=<id> first, then fallback to last saved ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("project");
    const loadFromLocal = () => {
      const last = localStorage.getItem(PROJECT_KEY);
      if (last) {
        loadProject(last).then((p) => {
          if (p) {
            dispatch({ t: "load", p });
            setSelId(p.messages[0]?.id ?? null);
          }
        });
      }
    };

    if (urlProjectId) {
      // First try Convex cloud database
      convex
        .query(api.projects.get, { projectId: urlProjectId })
        .then((cp) => {
          if (cp && cp.schemaVersion === 1) {
            const p: Project = {
              schemaVersion: 1,
              id: cp.projectId,
              title: cp.title,
              createdAt: cp.createdAt,
              updatedAt: cp.updatedAt,
              participants: cp.participants,
              messages: cp.messages,
              appearance: cp.appearance,
              exportSettings: cp.exportSettings,
            };
            dispatch({ t: "load", p });
            setSelId(p.messages[0]?.id ?? null);
            saveProject(p);
            localStorage.setItem(PROJECT_KEY, p.id);
            return;
          }
          // Fallback to local server API or local DB
          fetch(`/api/projects/${urlProjectId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((p) => {
              if (p && p.schemaVersion === 1) {
                dispatch({ t: "load", p });
                setSelId(p.messages[0]?.id ?? null);
                saveProject(p);
                localStorage.setItem(PROJECT_KEY, p.id);
              } else {
                loadFromLocal();
              }
            })
            .catch(() => loadFromLocal());
        })
        .catch(() => loadFromLocal());
    } else {
      loadFromLocal();
    }
  }, [convex]);

  // When user logs in, ensure their active project is synced to their cloud account
  useEffect(() => {
    if (connectParams && viewer !== undefined && (viewer === null || viewer.isAnonymous)) { setAuthMode("signIn"); setAuthOpen(true); }
  }, [connectParams, viewer]);

  const prevViewerRef = useRef<typeof viewer>(undefined);
  useEffect(() => {
    if (viewer && prevViewerRef.current === null) {
      showToast(`Welcome back, ${viewer.name}! Projects synced to cloud.`, "success");
      offloadMedia(project, authToken)
        .then((media) => saveProjectToConvex({
          projectId: project.id,
          title: project.title,
          schemaVersion: project.schemaVersion,
          exportSettings: project.exportSettings,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          ...media,
        }))
        .catch((err) => console.warn("Initial cloud sync error", err));
    }
    prevViewerRef.current = viewer;
  }, [viewer, project, authToken, saveProjectToConvex, showToast]);

  // ── autosave (debounced): saves to IndexedDB and syncs to Convex cloud + server ──
  useEffect(() => {
    setSaveState("dirty");
    const h = setTimeout(async () => {
      setSaveState("saving");
      // 1. Local IndexedDB save (always succeeds and keeps offline copy)
      await saveProject(project);
      localStorage.setItem(PROJECT_KEY, project.id);

      // 2. Local render server worker sync (best effort)
      fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      }).catch(() => {});

      // 3. Convex multi-user Cloud DB sync (if authenticated)
      if (viewer) {
        try {
          await saveProjectToConvex({
            projectId: project.id,
            title: project.title,
            schemaVersion: project.schemaVersion,
            exportSettings: project.exportSettings,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            ...(await offloadMedia(project, authToken)),
          });
        } catch (err) {
          console.warn("Convex autosave error", err);
        }
      }

      setSaveState("saved");
    }, 600);
    return () => clearTimeout(h);
  }, [project, viewer, authToken, saveProjectToConvex]);

  const handleSelectProject = useCallback((p: Project) => {
    dispatch({ t: "load", p });
    setSelId(p.messages[0]?.id ?? null);
    localStorage.setItem(PROJECT_KEY, p.id);
    const url = new URL(window.location.href);
    url.searchParams.set("project", p.id);
    window.history.replaceState({}, "", url.toString());
    showToast(`Loaded "${p.title}"`, "info");
  }, [showToast]);

  const handleCreateNewProject = useCallback(() => {
    const newP = createSampleProject();
    newP.id = "proj_" + Math.random().toString(36).slice(2, 10);
    newP.title = "New Reel";
    dispatch({ t: "load", p: newP });
    setSelId(newP.messages[0]?.id ?? null);
    localStorage.setItem(PROJECT_KEY, newP.id);
    const url = new URL(window.location.href);
    url.searchParams.set("project", newP.id);
    window.history.replaceState({}, "", url.toString());
    showToast("Created new project", "success");
  }, [showToast]);

  // ── keyboard: undo/redo/export ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); dispatch({ t: e.shiftKey ? "redo" : "undo" }); }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); dispatch({ t: "redo" }); }
      if (mod && e.key.toLowerCase() === "e") { e.preventDefault(); setExportOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── player frame polling ──
  useEffect(() => {
    const pr = playerRef.current;
    if (!pr) return;
    const onFrame = (e: { detail: { frame: number } }) => {
      setFrame(e.detail.frame);
      const stop = voiceStopRef.current;
      if (stop !== null && e.detail.frame >= stop) { voiceStopRef.current = null; pr.pause(); }
    };
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

  // `voice` adds a voice-message placeholder: a 3 s silent bubble until audio is
  // uploaded or recorded in the inspector.
  function addMessage(opts?: { voice?: boolean; image?: ImageAttachment }) {
    const idx = sel ? ordered.findIndex((m) => m.id === sel.id) : ordered.length - 1;
    const prev = ordered[idx];
    // default to the opposite sender of the previous message
    const otherSide = prev ? (project.participants.find((p) => p.id === prev.participantId)?.side === "right" ? "left" : "right") : "right";
    const part = project.participants.find((p) => p.side === otherSide) || project.participants[0];
    const isMe = part.side === "right";
    const nm: Message = {
      id: uid(), participantId: part.id, text: opts?.voice ? "Voice message" : opts?.image ? "" : "New message", order: 0,
      image: opts?.image,
      voice: opts?.voice ? { src: "", durationMs: 3000, peaks: [] } : undefined,
      delayMs: isMe ? 650 : 0, readingDurationMs: isMe ? 450 : 1200,
      animation: "pop", animationDurationMs: 280, typingDurationMs: isMe ? 0 : 1400,
      readReceipt: isMe,
    };
    const list = [...ordered];
    list.splice(idx + 1, 0, nm);
    setProject({ ...project, messages: reindex(list) });
    setSelId(nm.id);
  }
  // "Photo" button: pick an image first; the message is only created once it loaded
  const photoInputRef = useRef<HTMLInputElement>(null);
  async function onNewPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try { addMessage({ image: await imageFromFile(file) }); }
    catch (err) { showToast(err instanceof Error ? err.message : "Could not add that image.", "error"); }
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
    showToast("Reset to sample conversation", "info");
  }

  // ── preview controls ──
  const play = () => { voiceStopRef.current = null; playerRef.current?.play(); };
  const pause = () => playerRef.current?.pause();
  const toggle = () => (playing ? pause() : play());
  const restart = () => { voiceStopRef.current = null; playerRef.current?.seekTo(0); };
  const seek = (f: number) => { voiceStopRef.current = null; playerRef.current?.seekTo(f); };

  // The play icon on a voice bubble: play just that note (from the start, or resume where
  // it was paused) and stop when it ends; click again to pause.
  function toggleVoice(id: string) {
    const pr = playerRef.current;
    const ev = tl.events.find((e) => e.message.id === id);
    if (!pr || !ev || ev.voiceStart < 0) return;
    setSelId(id);
    const f = pr.getCurrentFrame();
    const inNote = f >= ev.voiceStart && f < ev.voiceEnd;
    if (inNote && pr.isPlaying()) { voiceStopRef.current = null; pr.pause(); return; }
    voiceStopRef.current = ev.voiceEnd;
    pr.seekTo(inNote ? f : ev.voiceStart);
    pr.play();
  }

  // selecting a message seeks to its reveal; current frame highlights a message
  function selectAndSeek(m: Message) {
    setSelId(m.id);
    const ev = tl.events.find((e) => e.message.id === m.id);
    // land on the last frame of its entry animation: the bubble is fully shown (at revealStart it
    // is still at 0% opacity, so the selected message looked missing), yet still before the next
    // message can start
    if (ev) seek(Math.max(ev.revealStart, ev.revealEnd - 1));
  }
  const curIdx = currentEventIndex(tl, frame);
  const curId = tl.events[curIdx]?.message.id;

  const fmt = (f: number) => {
    const s = framesToSeconds(f);
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 10))}`;
  };

  const partName = (id: string) => project.participants.find((p) => p.id === id)?.name || "?";


  return (
    <div className="app">
      {/* toolbar */}
      <header className="toolbar" role="toolbar" aria-label="Editor toolbar">
        <div className="tb-group brand-group">
          <div className="brand"><span className="dot" aria-hidden="true" /> ChatVid</div>
          <button
            type="button"
            className="tb-btn tb-projects-btn"
            onClick={() => setProjectsOpen(true)}
            title="Open Cloud Projects (All reels)"
            aria-label="Cloud Projects"
          >
            <FolderKanban size={IC} /> <span className="lbl">Projects</span>
          </button>
          <div className="title-wrap" title="Click to rename project">
            <input
              className="title-input"
              aria-label="Project name"
              value={project.title}
              onChange={(e) => setProject({ ...project, title: e.target.value }, true)}
            />
            <Pencil size={12} className="title-pencil-hint" aria-hidden="true" />
          </div>
        </div>

        <div className="tb-divider" aria-hidden="true" />

        {/* History actions group */}
        <div className="tb-group" role="group" aria-label="History actions">
          <button
            className="tb-btn"
            onClick={() => dispatch({ t: "undo" })}
            disabled={!state.past.length}
            title="Undo (⌘Z)"
            aria-label="Undo (⌘Z)"
          >
            <Undo2 size={IC} /> <span className="lbl">Undo</span>
          </button>
          <button
            className="tb-btn"
            onClick={() => dispatch({ t: "redo" })}
            disabled={!state.future.length}
            title="Redo (⌘⇧Z)"
            aria-label="Redo (⌘⇧Z)"
          >
            <Redo2 size={IC} /> <span className="lbl">Redo</span>
          </button>
        </div>

        <div className="tb-divider" aria-hidden="true" />

        {/* Content actions group */}
        <div className="tb-group" role="group" aria-label="Content actions">
          <button
            className="tb-btn"
            onClick={() => setImportOpen(true)}
            title="Paste import chat"
            aria-label="Paste import chat"
          >
            <ClipboardPaste size={IC} /> <span className="lbl">Paste import</span>
          </button>
          <button
            className="tb-btn"
            onClick={resetProject}
            title="Reset to sample chat"
            aria-label="Reset project"
          >
            <RotateCcw size={IC} /> <span className="lbl">Reset</span>
          </button>
        </div>

        <div className="tb-spacer" />

        {/* Status & Export actions group */}
        <div className="tb-group status-export-group">
          <div className="save-state-indicator" aria-live="polite">
            {saveState === "saving" ? (
              <>
                <span className="save-dot saving" aria-hidden="true" />
                <span className="save-text">{viewer ? "Syncing…" : "Saving…"}</span>
              </>
            ) : saveState === "dirty" ? (
              <>
                <span className="save-dot dirty" aria-hidden="true" />
                <span className="save-text">Unsaved</span>
              </>
            ) : (
              <>
                <Check size={13} className="save-check" aria-hidden="true" />
                <span className="save-text">{viewer ? "Cloud synced" : "Saved locally"}</span>
              </>
            )}
          </div>

          <UserMenu
            onOpenProjects={() => setProjectsOpen(true)}
            onOpenAuth={(mode) => {
              setAuthMode(mode ?? "signIn");
              setAuthOpen(true);
            }}
          />
          <button
            type="button"
            className={`tb-btn tb-drawer-btn ${inspectorDrawerOpen ? "active" : ""}`}
            onClick={() => setInspectorDrawerOpen(!inspectorDrawerOpen)}
            title="Toggle Inspector drawer"
            aria-label="Toggle Inspector drawer"
            aria-expanded={inspectorDrawerOpen}
          >
            <SlidersHorizontal size={IC} /> <span className="lbl">Inspector</span>
          </button>
          <button
            type="button"
            className={`tb-btn primary ${isExporting ? "is-loading" : ""}`}
            onClick={() => setExportOpen(true)}
            title={isExporting ? "Export in progress…" : "Export video or image (⌘E)"}
            aria-label={isExporting ? "Export in progress" : "Export video or image (⌘E)"}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <Loader2 size={IC} className="spin" /> <span>Exporting…</span>
              </>
            ) : (
              <>
                <Download size={IC} /> <span>Export</span>
              </>
            )}
          </button>
        </div>
      </header>

      <div className="workspace">
        {/* message list */}
        <div className={`panel left ${mobileTab === "list" ? "active" : ""}`}>
          <div className="panel-head"><h2>Messages</h2><span className="count">{ordered.length}</span></div>
          <div className="panel-body">
            {ordered.length === 0 && (
              <div className="empty-list">
                <MessageSquarePlus size={26} />
                <p>No messages yet</p>
                <button className="tb-btn" onClick={() => addMessage()}>Add the first message</button>
              </div>
            )}
            {ordered.map((m) => {
              const part = project.participants.find((p) => p.id === m.participantId);
              const isMe = part?.side === "right";
              const avColor = isMe ? "var(--blue-500)" : "var(--brand-500)";
              const cls = ["msg-item", isMe ? "me" : "them", selId === m.id ? "sel" : "", curId === m.id && playing ? "cur" : "",
                overId === m.id && dragId && dragId !== m.id ? "drop" : "", dragId === m.id ? "dragging" : ""].join(" ");
              return (
                <div key={m.id} className={cls} role="button" tabIndex={0} draggable
                  aria-label={`${part?.name ?? "?"}: ${m.text || "empty message"}`}
                  aria-selected={selId === m.id}
                  onClick={() => selectAndSeek(m)}
                  onDragStart={(e) => { setDragId(m.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", m.id); }}
                  onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(m.id); } }}
                  onDrop={(e) => { e.preventDefault(); if (dragId) moveTo(dragId, m.id); setDragId(null); setOverId(null); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const el = e.currentTarget;
                    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) { e.preventDefault(); move(m.id, e.key === "ArrowUp" ? -1 : 1); return; }
                    if (e.key === "Enter") { e.preventDefault(); selectAndSeek(m); document.getElementById("mtext")?.focus(); }
                    else if (e.key === " ") { e.preventDefault(); selectAndSeek(m); }
                    else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      const idx = ordered.findIndex((item) => item.id === m.id);
                      const next = ordered[idx + 1];
                      if (next) { selectAndSeek(next); (el.nextElementSibling as HTMLElement | null)?.focus(); }
                    }
                    else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      const idx = ordered.findIndex((item) => item.id === m.id);
                      const prev = ordered[idx - 1];
                      if (prev) { selectAndSeek(prev); (el.previousElementSibling as HTMLElement | null)?.focus(); }
                    }
                    else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteMessage(m.id); }
                  }}>
                  <span className="msg-grip" aria-hidden="true" title="Drag to reorder"><GripVertical size={13} /></span>
                  <span className="msg-av" style={{ background: avColor }} aria-hidden="true">{partName(m.participantId).charAt(0).toUpperCase()}</span>
                  <div className="msg-main">
                    <div className="msg-text">
                      {m.voice
                        ? <span className="msg-voice"><Mic size={12} aria-hidden="true" /> Voice message · {fmtVoiceTime(m.voice.durationMs)}</span>
                        : m.image
                          ? <span className="msg-voice"><ImageIcon size={12} aria-hidden="true" /> Photo{m.text.trim() ? ` · ${m.text}` : ""}</span>
                          : (m.text || <em>Empty message</em>)}
                    </div>
                    <div className="msg-meta">
                      <span className="msg-who">{partName(m.participantId)}</span>
                      {m.typingDurationMs > 0 && (
                        <span
                          className={`meta-chip ${m.voice ? "recording" : "typing"}`}
                          title={`${m.voice ? "Recording audio" : "Typing"}: ${(m.typingDurationMs / 1000).toFixed(1)}s`}
                        >
                          {m.voice ? <Mic size={11} /> : <Ellipsis size={11} />}
                          <span>{(m.typingDurationMs / 1000).toFixed(1)}s</span>
                        </span>
                      )}
                      {m.readReceipt && (
                        <span className="meta-chip read-receipt" title="Read receipt (ticks)">
                          <CheckCheck size={11} />
                        </span>
                      )}
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
          <div className="add-row">
            <button className="tb-btn" onClick={() => addMessage()}><Plus size={IC} /> Add message</button>
            <button className="tb-btn" onClick={() => addMessage({ voice: true })} title="Add a voice message (upload or record audio in the inspector)"><Mic size={IC} /> Voice</button>
            <button className="tb-btn" onClick={() => photoInputRef.current?.click()} title="Add a photo message (choose an image)"><ImagePlus size={IC} /> Photo</button>
            <input ref={photoInputRef} type="file" accept={IMAGE_ACCEPT} onChange={onNewPhoto} hidden />
          </div>
        </div>

        {/* preview */}
        <div className={`panel preview ${mobileTab === "preview" ? "active" : ""}`} style={{ background: project.appearance.sceneBackground || "#e9ede7" }}>
          <div className="layout-toggle" role="group" aria-label="Layout mode">
            <button
              type="button"
              className={`layout-btn ${project.appearance.layout === "phone" ? "on" : ""}`}
              aria-pressed={project.appearance.layout === "phone"}
              onClick={() => setProject({ ...project, appearance: { ...project.appearance, layout: "phone" } })}
            >
              <Smartphone size={13} /> <span>Phone</span>
            </button>
            <button
              type="button"
              className={`layout-btn ${project.appearance.layout === "fullscreen" ? "on" : ""}`}
              aria-pressed={project.appearance.layout === "fullscreen"}
              onClick={() => setProject({ ...project, appearance: { ...project.appearance, layout: "fullscreen" } })}
            >
              <Maximize2 size={13} /> <span>Full screen</span>
            </button>
          </div>
          <div className="preview-stage" ref={stageRef} style={{ background: project.appearance.sceneBackground || "#e9ede7" }}>
            <div className="player-wrap" style={{ width: playerSize.w, height: playerSize.h }}>
              <Player
                ref={playerRef}
                component={ChatComposition as any}
                inputProps={{ project, playerPlaying: playing, onVoiceToggle: toggleVoice }}
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
          {/* floating pill playback bar */}
          {(() => {
            const progressPct = totalFrames > 1 ? (Math.min(frame, totalFrames - 1) / (totalFrames - 1)) * 100 : 0;
            return (
              <div className="preview-controls" role="region" aria-label="Playback controls">
                <button className="pc-btn" onClick={restart} title="Restart" aria-label="Restart">
                  <SkipBack size={15} />
                </button>
                <button
                  className={`pc-btn play-btn ${playing ? "playing" : ""}`}
                  onClick={toggle}
                  title={playing ? "Pause" : "Play"}
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <input
                  className="pc-seek"
                  type="range"
                  min={0}
                  max={totalFrames - 1}
                  value={Math.min(frame, totalFrames - 1)}
                  style={{
                    background: `linear-gradient(to right, var(--accent) ${progressPct}%, var(--gray-300) ${progressPct}%)`
                  }}
                  aria-label="Seek video"
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <span className="pc-time">{fmt(frame)} / {fmt(totalFrames)}</span>
                <select
                  className="pc-speed"
                  aria-label="Playback speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  <option value={0.5}>0.5×</option>
                  <option value={1}>1×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2×</option>
                </select>
              </div>
            );
          })()}
        </div>

        {/* properties */}
        {/* properties / inspector */}
        <div className={`panel right ${inspectorDrawerOpen ? "drawer-open" : ""} ${mobileTab === "props" ? "active" : ""}`}>
          <div className="panel-head">
            <h2>Inspector</h2>
            <div className="panel-head-actions">
              {sel && (
                <span className="count">
                  Message {project.messages.findIndex((x) => x.id === sel.id) + 1}
                </span>
              )}
              <button
                type="button"
                className="icon-btn drawer-close-btn"
                onClick={() => setInspectorDrawerOpen(false)}
                title="Close Inspector drawer"
                aria-label="Close Inspector drawer"
              >
                <X size={15} />
              </button>
            </div>
          </div>
          <div className="panel-body">
            {sel ? (
              <MessageProps key={sel.id} m={sel} project={project} onChange={updateMessage} />
            ) : (
              <div className="empty">Select a message to edit its text, timing, and read receipts.</div>
            )}
            <hr className="inspector-divider" />
            <AppearanceProps project={project} onChange={setProject} />
          </div>
        </div>

        {inspectorDrawerOpen && (
          <div
            className="drawer-scrim"
            onClick={() => setInspectorDrawerOpen(false)}
            aria-hidden="true"
          />
        )}
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
        onAddMessage={() => addMessage()}
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
          onImport={(msgs) => {
            setProject({ ...project, messages: msgs });
            setSelId(msgs[0]?.id ?? null);
            setImportOpen(false);
            showToast(`Imported ${msgs.length} messages successfully`, "success");
          }}
        />
      )}

      {exportOpen && (
        <ExportDialog
          project={project}
          totalFrames={totalFrames}
          onClose={() => setExportOpen(false)}
          onExportStart={() => {
            setIsExporting(true);
            showToast("Export render started…", "info");
          }}
          onExportFinish={() => {
            setIsExporting(false);
            showToast("Export completed successfully!", "success");
          }}
          onExportError={(msg) => {
            setIsExporting(false);
            showToast(`Export error: ${msg}`, "error");
          }}
        />
      )}

      {/* Cloud Modals */}
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        defaultMode={authMode}
        onSuccess={() => {
          showToast("Signed in successfully!", "success");
        }}
      />

      {connectParams && viewer && !viewer.isAnonymous && (
        <ConnectDialog params={connectParams} userName={viewer.name} onClose={() => { setConnectParams(null); history.replaceState(null, "", "/"); }} />
      )}

      <ProjectsModal
        isOpen={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        currentProjectId={project.id}
        onSelectProject={handleSelectProject}
        onCreateNew={handleCreateNewProject}
        onOpenAuth={() => {
          setProjectsOpen(false);
          setAuthMode("signIn");
          setAuthOpen(true);
        }}
      />

      {/* Floating Toast Feedback Notifications */}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type || "info"}`}>
            {t.type === "success" && <Check size={14} className="toast-icon" />}
            {t.type === "error" && <TriangleAlert size={14} className="toast-icon" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* "Best used on desktop" notice when screen width < 900px */}
      {!dismissDesktopNotice && (
        <div className="desktop-notice" aria-live="polite">
          <div className="desktop-notice-card">
            <button
              type="button"
              className="desktop-notice-close"
              onClick={() => setDismissDesktopNotice(true)}
              aria-label="Dismiss notice"
            >
              <X size={16} />
            </button>
            <Smartphone size={32} className="desktop-notice-icon" aria-hidden="true" />
            <h3>Best used on desktop</h3>
            <p>ChatVid’s video timeline and multi-panel editor is optimized for screens at least 900px wide.</p>
            <p className="desktop-notice-hint">You can continue to preview the mobile layout or switch to a desktop computer.</p>
            <div className="desktop-notice-actions">
              <button
                type="button"
                className="tb-btn primary"
                onClick={() => setDismissDesktopNotice(true)}
              >
                Continue to mobile view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsible section component with remembered state ──
function CollapsibleSection({
  title,
  storageKey,
  defaultCollapsed = true,
  children,
}: {
  title: string;
  storageKey: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== null ? saved === "true" : defaultCollapsed;
    } catch {
      return defaultCollapsed;
    }
  });

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {
        // ignore localStorage errors
      }
      return next;
    });
  };

  return (
    <div className="inspector-section">
      <button
        type="button"
        className="inspector-sec-head inspector-sec-toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
      >
        <span>{title}</span>
        <ChevronDown
          size={14}
          className={`inspector-sec-chevron ${collapsed ? "collapsed" : ""}`}
        />
      </button>
      {!collapsed && <div className="inspector-sec-content">{children}</div>}
    </div>
  );
}

// ── Number input with inline unit suffix ("s") and step support ──
function NumberInputWithSuffix({
  id,
  value,
  step = 0.1,
  min = 0,
  suffix = "s",
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: number;
  step?: number;
  min?: number;
  suffix?: string;
  onChange: (val: number) => void;
  ariaLabel?: string;
}) {
  return (
    <div className="input-with-suffix">
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        value={Number.isFinite(value) ? value : 0}
        aria-label={ariaLabel}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          onChange(Number.isFinite(val) && val >= min ? val : min);
        }}
      />
      <span className="input-suffix">{suffix}</span>
    </div>
  );
}

// ── message properties panel ──
function MessageProps({
  m,
  project,
  onChange,
}: {
  m: Message;
  project: Project;
  onChange: (id: string, p: Partial<Message>, squash?: boolean) => void;
}) {
  return (
    <>
      {/* 1. MESSAGE SECTION */}
      <div className="inspector-section">
        <div className="inspector-sec-head">
          <span>Message</span>
        </div>
        <div className="inspector-sec-content">
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="mtext">Message text</label>
              <span className="field-count-hint">{m.text.length} chars</span>
            </div>
            <textarea
              id="mtext"
              value={m.text}
              placeholder="Type a message..."
              onChange={(e) => onChange(m.id, { text: e.target.value }, true)}
            />
          </div>
          <VoicePanel key={m.id} m={m} onChange={onChange} />
          <ImagePanel key={`${m.id}-img`} m={m} onChange={onChange} />
          <div className="row2">
            <div className="field">
              <label htmlFor="msender">Sender</label>
              <select
                id="msender"
                value={m.participantId}
                onChange={(e) => onChange(m.id, { participantId: e.target.value })}
              >
                {project.participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.side === "right" ? "You" : "Them"})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="manim">Entry animation</label>
              <select
                id="manim"
                value={m.animation}
                onChange={(e) => onChange(m.id, { animation: e.target.value as EntryAnimation })}
              >
                <option value="instant">Instant</option>
                <option value="fade">Fade</option>
                <option value="slide">Slide</option>
                <option value="pop">Pop</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <hr className="inspector-divider" />

      {/* 2. TIMING SECTION (collapsible, collapsed by default) */}
      <CollapsibleSection title="Timing" storageKey="chatvid_timing_collapsed" defaultCollapsed={true}>
        <div className="row2">
          <div className="field">
            <label htmlFor="mdelay">Pause before reply</label>
            <NumberInputWithSuffix
              id="mdelay"
              value={m.delayMs / 1000}
              step={0.1}
              min={0}
              ariaLabel="Pause before reply in seconds"
              onChange={(v) => onChange(m.id, { delayMs: v * 1000 })}
            />
          </div>
          <div className="field">
            <label htmlFor="mread">Reading pause</label>
            <NumberInputWithSuffix
              id="mread"
              value={m.readingDurationMs / 1000}
              step={0.1}
              min={0}
              ariaLabel="Reading pause in seconds"
              onChange={(v) => onChange(m.id, { readingDurationMs: v * 1000 })}
            />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="manimd">Animation duration</label>
            <NumberInputWithSuffix
              id="manimd"
              value={m.animationDurationMs / 1000}
              step={0.05}
              min={0}
              ariaLabel="Animation duration in seconds"
              onChange={(v) => onChange(m.id, { animationDurationMs: v * 1000 })}
            />
          </div>
          <div className="field">
            <label htmlFor="mtype">{m.voice ? "Recording time" : "Typing time"}</label>
            <NumberInputWithSuffix
              id="mtype"
              value={m.typingDurationMs / 1000}
              step={0.1}
              min={0}
              ariaLabel={m.voice ? "Recording time in seconds" : "Typing time in seconds"}
              onChange={(v) => onChange(m.id, { typingDurationMs: v * 1000 })}
            />
          </div>
        </div>
      </CollapsibleSection>

      <hr className="inspector-divider" />

      {/* 3. APPEARANCE SECTION */}
      <div className="inspector-section">
        <div className="inspector-sec-head">
          <span>Appearance</span>
        </div>
        <div className="inspector-sec-content">
          <div className="field">
            <label htmlFor="mts">Timestamp</label>
            <input
              id="mts"
              type="text"
              placeholder={`${autoStamps(project)[m.id] ?? "10:14"} (auto)`}
              value={m.timestamp || ""}
              onChange={(e) => onChange(m.id, { timestamp: e.target.value }, true)}
            />
          </div>
          <div className="toggle-row">
            <div className="toggle-label-wrap">
              <span className="toggle-label">Read receipt</span>
              <span className="toggle-hint">Blue double ticks when read</span>
            </div>
            <button
              type="button"
              role="switch"
              className={`switch ${m.readReceipt ? "on" : ""}`}
              aria-checked={m.readReceipt}
              aria-label="Read receipt toggle"
              onClick={() => onChange(m.id, { readReceipt: !m.readReceipt })}
            >
              <span className="switch-thumb" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Photo picker for one participant: preview, upload (data URL, stays local), remove.
function PhotoField({ label, who, onSet }: { label: string; who: Participant; onSet: (url: string | undefined) => void }) {
  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    if (file.size > 10 * 1024 * 1024) { alert("Image must be under 10 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => onSet(String(reader.result));
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file
  }
  return (
    <div className="field">
      <label>{label}</label>
      <div className="avatar-edit">
        <img className="avatar-preview" alt={`${label} preview`} src={who.avatarUrl || avatarDataUri(who.color)} />
        <div className="avatar-actions">
          <label className="tb-btn file-btn" title="Upload custom photo">
            <Upload size={IC} /> Upload…
            <input type="file" accept="image/*" onChange={onPhoto} hidden />
          </label>
          {who.avatarUrl && (
            <button type="button" className="tb-btn" onClick={() => onSet(undefined)}>Remove</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── appearance / global panel ──
function AppearanceProps({ project, onChange }: { project: Project; onChange: (p: Project) => void }) {
  const a = project.appearance;
  const set = (patch: Partial<typeof a>) => onChange({ ...project, appearance: { ...a, ...patch } });
  const them = project.participants.find((p) => p.side === "left") || project.participants[0];
  // "You": the right-hand sender, whose photo shows on your voice messages
  const me = project.participants.find((p) => p.side === "right" && p.id !== them.id);
  const setAvatar = (id: string, url: string | undefined) =>
    onChange({ ...project, participants: project.participants.map((p) => (p.id === id ? { ...p, avatarUrl: url } : p)) });

  return (
    <>
      {/* 4. CONTACT SECTION (collapsible, collapsed by default) */}
      <CollapsibleSection title="Contact" storageKey="chatvid_contact_collapsed" defaultCollapsed={true}>
        <PhotoField label="Profile photo" who={them} onSet={(url) => setAvatar(them.id, url)} />
        {me && <PhotoField label="Your photo" who={me} onSet={(url) => setAvatar(me.id, url)} />}
        <div className="field">
          <label htmlFor="cname">Contact name</label>
          <input
            id="cname"
            type="text"
            placeholder="Contact name"
            value={a.contactName}
            onChange={(e) => set({ contactName: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="csub">Status text</label>
          <input
            id="csub"
            type="text"
            placeholder="e.g. online, typing..."
            value={a.contactSub}
            onChange={(e) => set({ contactSub: e.target.value })}
          />
        </div>
      </CollapsibleSection>

      <hr className="inspector-divider" />

      {/* 5. SCENE SECTION */}
      <div className="inspector-section">
        <div className="inspector-sec-head">
          <span>Scene</span>
        </div>
        <div className="inspector-sec-content">
          <div className="field">
            <label htmlFor="cwall">Chat wallpaper</label>
            <select
              id="cwall"
              value={a.wallpaperUrl || ""}
              onChange={(e) => set({ wallpaperUrl: e.target.value || undefined })}
            >
              <option value="wa-bg.webp">WhatsApp doodles</option>
              <option value="">None (plain)</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="chold">End hold</label>
            <NumberInputWithSuffix
              id="chold"
              value={a.endHoldMs / 1000}
              step={0.1}
              min={0}
              ariaLabel="End hold duration in seconds"
              onChange={(v) => set({ endHoldMs: Math.max(0, v) * 1000 })}
            />
          </div>

          <div className="field">
            <label>Scene background</label>
            <div className="swatches-grid">
              {SCENE_PRESETS.map((preset) => {
                const isSelected = a.sceneBackground === preset.value;
                const isDark =
                  preset.value === "#0c0e12" ||
                  preset.value === "#111827" ||
                  preset.value.includes("#0f172a");
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={`swatch-btn ${isSelected ? "selected" : ""}`}
                    style={{ background: preset.value }}
                    title={preset.name}
                    aria-label={`Background preset: ${preset.name}`}
                    onClick={() => set({ sceneBackground: preset.value })}
                  >
                    {isSelected && (
                      <Check
                        size={13}
                        strokeWidth={2.8}
                        className="swatch-check"
                        style={{ color: isDark ? "#ffffff" : "#1f7a4d" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="scene-custom">
              <div className="color-picker-wrap" title="Pick custom color">
                <input
                  type="color"
                  aria-label="Custom background color picker"
                  value={/^#[0-9a-fA-F]{6}$/.test(a.sceneBackground) ? a.sceneBackground : "#e9ede7"}
                  onChange={(e) => set({ sceneBackground: e.target.value })}
                />
              </div>
              <input
                type="text"
                aria-label="Custom background color hex or CSS"
                placeholder="#E9EDE7"
                value={a.sceneBackground || "#e9ede7"}
                onChange={(e) => set({ sceneBackground: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const SCENE_PRESETS = [
  { name: "Sage Light", value: "#e9ede7" },
  { name: "Pure White", value: "#ffffff" },
  { name: "Studio Black", value: "#0c0e12" },
  { name: "Midnight Navy", value: "#111827" },
  { name: "Warm Cream", value: "#f3e9dd" },
  { name: "Sand Linen", value: "#ead7c3" },
  { name: "Pastel Sky", value: "linear-gradient(160deg,#dbeafe,#ede9fe)" },
  { name: "Sunset Glow", value: "linear-gradient(160deg,#fde68a,#fca5a5)" },
  { name: "Fresh Mint", value: "linear-gradient(160deg,#a7f3d0,#6ee7b7)" },
  { name: "Deep Slate", value: "linear-gradient(160deg,#1e293b,#0f172a)" },
];

