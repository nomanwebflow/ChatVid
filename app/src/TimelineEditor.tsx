import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import type { TimelineRow, TimelineAction, TimelineEffect } from "@xzdarcy/timeline-engine";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import type { Project, Message } from "./types";
import { FPS } from "./types";
import type { Timeline as TimelineEngineData, Event } from "./timeline";
import {
  Play,
  Pause,
  SkipBack,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Magnet,
  Layers,
  Ellipsis,
  CheckCheck,
  Plus,
} from "lucide-react";

interface TimelineEditorProps {
  project: Project;
  tl: TimelineEngineData;
  frame: number;
  totalFrames: number;
  playing: boolean;
  selId: string | null;
  curId?: string;
  onSelect: (m: Message) => void;
  onSeek: (f: number) => void;
  onPlayToggle: () => void;
  onRestart: () => void;
  onUpdateMessage: (id: string, patch: Partial<Message>) => void;
  onAddMessage: () => void;
}

const effects: Record<string, TimelineEffect> = {
  message: {
    id: "message",
    name: "Message",
  },
};

export function EditorTimeline({
  project,
  tl,
  frame,
  totalFrames,
  playing,
  selId,
  curId,
  onSelect,
  onSeek,
  onPlayToggle,
  onRestart,
  onUpdateMessage,
  onAddMessage,
}: TimelineEditorProps) {
  const timelineRef = useRef<TimelineState>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingCursor = useRef(false);

  // Zoom scale: scaleWidth in px per second
  const [scaleWidth, setScaleWidth] = useState(120);
  const [trackMode, setTrackMode] = useState<"multi" | "single">("multi");
  const [gridSnap, setGridSnap] = useState(true);

  const totalDurationSec = useMemo(() => totalFrames / FPS, [totalFrames]);
  const currentSec = frame / FPS;

  // Sync Remotion player frame to Timeline playhead
  useEffect(() => {
    if (timelineRef.current && !isDraggingCursor.current) {
      timelineRef.current.setTime(currentSec);
    }
  }, [currentSec]);

  // Map messages and events to timeline rows
  const eventMap = useMemo(() => {
    const map = new Map<string, Event>();
    for (const ev of tl.events) {
      map.set(ev.message.id, ev);
    }
    return map;
  }, [tl]);

  const editorData = useMemo<TimelineRow[]>(() => {
    if (trackMode === "single") {
      const actions: TimelineAction[] = [];
      for (const ev of tl.events) {
        const start = (ev.typingStart >= 0 ? ev.typingStart : ev.revealStart) / FPS;
        const end = ev.readEnd / FPS;
        actions.push({
          id: ev.message.id,
          start,
          end: Math.max(end, start + 0.1),
          effectId: "message",
          flexible: true,
          movable: true,
        });
      }
      return [
        {
          id: "all-messages",
          actions,
          rowHeight: 48,
        },
      ];
    }

    // Multi-track mode: one track per participant
    return project.participants.map((p) => {
      const actions: TimelineAction[] = [];
      for (const ev of tl.events) {
        if (ev.message.participantId === p.id) {
          const start = (ev.typingStart >= 0 ? ev.typingStart : ev.revealStart) / FPS;
          const end = ev.readEnd / FPS;
          actions.push({
            id: ev.message.id,
            start,
            end: Math.max(end, start + 0.1),
            effectId: "message",
            flexible: true,
            movable: true,
          });
        }
      }
      return {
        id: p.id,
        actions,
        rowHeight: 48,
      };
    });
  }, [trackMode, project.participants, tl]);

  // Zoom fit helper
  const handleZoomFit = useCallback(() => {
    if (!containerRef.current) return;
    const availWidth = containerRef.current.clientWidth - 180; // track header offset
    if (availWidth > 0 && totalDurationSec > 0) {
      const fitWidth = Math.max(40, Math.min(300, Math.floor(availWidth / Math.max(totalDurationSec, 2))));
      setScaleWidth(fitWidth);
    }
  }, [totalDurationSec]);

  // Custom action block rendering
  const renderAction = useCallback(
    (action: TimelineAction) => {
      const ev = eventMap.get(action.id);
      if (!ev) return null;
      const m = ev.message;
      const part = project.participants.find((p) => p.id === m.participantId);
      const isSel = m.id === selId;
      const isCur = m.id === curId;
      const color = part?.color || "#1f7a4d";

      const totalSpan = Math.max(0.1, action.end - action.start);
      const hasTyping = ev.typingStart >= 0 && ev.typingEnd > ev.typingStart;
      const typingSpanSec = hasTyping ? (ev.typingEnd - ev.typingStart) / FPS : 0;
      const typingPct = hasTyping ? Math.min(65, Math.max(15, (typingSpanSec / totalSpan) * 100)) : 0;

      return (
        <div
          className={`tl-nle-action ${isSel ? "is-selected" : ""} ${isCur ? "is-current" : ""}`}
          style={{ borderColor: color }}
          title={`${part?.name || "?"}: ${m.text || "(empty)"}`}
        >
          {hasTyping && (
            <div
              className="tl-nle-typing-seg"
              style={{ width: `${typingPct}%` }}
              title={`Typing: ${typingSpanSec.toFixed(1)}s`}
            >
              <Ellipsis size={13} className="tl-nle-typing-icon" />
              <span className="tl-nle-typing-label">{typingSpanSec.toFixed(1)}s</span>
            </div>
          )}
          <div className="tl-nle-content" style={{ background: color }}>
            <span
              className="tl-nle-avatar"
              style={{ background: "rgba(255,255,255,0.25)" }}
            >
              {(part?.name || "?").charAt(0).toUpperCase()}
            </span>
            <span className="tl-nle-text">{m.text || <em>Empty</em>}</span>
            {m.readReceipt && (
              <span className="tl-nle-ticks" title="Read receipt">
                <CheckCheck size={12} />
              </span>
            )}
            <span className="tl-nle-dur">
              {((ev.readEnd - ev.revealStart) / FPS).toFixed(1)}s
            </span>
          </div>
        </div>
      );
    },
    [eventMap, project.participants, selId, curId]
  );

  // Time format: mm:ss.d
  const fmt = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${mins}:${String(secs).padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="editor-timeline-panel" ref={containerRef}>
      {/* Timeline Controls Header */}
      <div className="etl-toolbar">
        <div className="etl-left-tools">
          <button
            type="button"
            className="etl-btn"
            onClick={onRestart}
            title="Jump to start (Home)"
            aria-label="Restart timeline to start"
          >
            <SkipBack size={13} />
          </button>
          <button
            type="button"
            className={`etl-btn ${playing ? "active" : ""}`}
            onClick={onPlayToggle}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <div className="etl-time-readout" title="Current time / Total duration">
            <span className="etl-cur-time">{fmt(currentSec)}</span>
            <span className="etl-time-div">/</span>
            <span className="etl-tot-time">{fmt(totalDurationSec)}</span>
            <span className="etl-frame-readout">({frame}f)</span>
          </div>
        </div>

        <div className="etl-center-tools">
          <button
            type="button"
            className={`etl-toggle-btn ${trackMode === "multi" ? "on" : ""}`}
            onClick={() => setTrackMode(trackMode === "multi" ? "single" : "multi")}
            title="Toggle Multi-Track / Single-Track layout"
            aria-pressed={trackMode === "multi"}
          >
            <Layers size={13} />
            <span>{trackMode === "multi" ? "Multi-Track" : "Single-Track"}</span>
          </button>

          <button
            type="button"
            className={`etl-toggle-btn ${gridSnap ? "on" : ""}`}
            onClick={() => setGridSnap(!gridSnap)}
            title="Toggle Grid Snapping"
            aria-pressed={gridSnap}
          >
            <Magnet size={13} />
            <span>Snap</span>
          </button>

          <button
            type="button"
            className="etl-toggle-btn"
            onClick={onAddMessage}
            title="Add message at end"
            aria-label="Add message"
          >
            <Plus size={13} />
            <span>Add</span>
          </button>
        </div>

        <div className="etl-right-tools">
          <div className="etl-zoom-control">
            <button
              type="button"
              className="etl-btn icon-only"
              onClick={() => setScaleWidth((w) => Math.max(50, w - 20))}
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <input
              type="range"
              min={50}
              max={280}
              step={10}
              value={scaleWidth}
              onChange={(e) => setScaleWidth(Number(e.target.value))}
              className="etl-zoom-slider"
              aria-label="Timeline zoom slider"
            />
            <button
              type="button"
              className="etl-btn icon-only"
              onClick={() => setScaleWidth((w) => Math.min(280, w + 20))}
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              className="etl-btn icon-only"
              onClick={handleZoomFit}
              title="Fit timeline to view"
              aria-label="Fit to view"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Timeline Workspace (Track Sidebar + Premade Timeline Component) */}
      <div className="etl-workspace">
        {/* Track Headers Sidebar */}
        <div className="etl-sidebar">
          <div className="etl-ruler-corner">TRACKS</div>
          <div className="etl-track-headers">
            {trackMode === "single" ? (
              <div className="etl-track-header-item" style={{ height: 48 }}>
                <span className="etl-th-dot" style={{ background: "var(--accent)" }} />
                <div className="etl-th-info">
                  <span className="etl-th-name">Conversation</span>
                  <span className="etl-th-sub">{tl.events.length} clips</span>
                </div>
              </div>
            ) : (
              project.participants.map((p) => {
                const count = tl.events.filter((e) => e.message.participantId === p.id).length;
                return (
                  <div key={p.id} className="etl-track-header-item" style={{ height: 48 }}>
                    <span className="etl-th-dot" style={{ background: p.color || "#888" }} />
                    <div className="etl-th-info">
                      <span className="etl-th-name">{p.name}</span>
                      <span className="etl-th-sub">
                        {p.side === "right" ? "Me (Right)" : "Them (Left)"} · {count}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Premade Timeline Component */}
        <div className="etl-stage">
          <Timeline
            ref={timelineRef}
            editorData={editorData}
            effects={effects}
            scale={1}
            scaleWidth={scaleWidth}
            scaleSplitCount={10}
            startLeft={16}
            minScaleCount={Math.max(10, Math.ceil(totalDurationSec) + 3)}
            rowHeight={48}
            gridSnap={gridSnap}
            dragLine={true}
            style={{ width: "100%", height: "100%", background: "transparent" }}
            getActionRender={renderAction}
            getScaleRender={(sec: number) => {
              const m = Math.floor(sec / 60);
              const s = Math.floor(sec % 60);
              return `${m}:${String(s).padStart(2, "0")}s`;
            }}
            onCursorDragStart={() => {
              isDraggingCursor.current = true;
            }}
            onCursorDrag={(sec: number) => {
              onSeek(Math.round(sec * FPS));
            }}
            onCursorDragEnd={(sec: number) => {
              isDraggingCursor.current = false;
              onSeek(Math.round(sec * FPS));
            }}
            onClickTimeArea={(sec: number) => {
              onSeek(Math.round(sec * FPS));
              return true;
            }}
            onClickAction={(_e, { action }) => {
              const m = project.messages.find((msg) => msg.id === action.id);
              if (m) onSelect(m);
            }}
            onActionResizeEnd={({ action, start, end, dir }) => {
              const m = project.messages.find((msg) => msg.id === action.id);
              if (!m) return;
              const newDurSec = end - start;
              const typingSec = m.typingDurationMs / 1000;
              const animSec = m.animationDurationMs / 1000;

              if (dir === "right") {
                const newReadingSec = Math.max(0.2, newDurSec - typingSec - animSec);
                onUpdateMessage(m.id, { readingDurationMs: Math.round(newReadingSec * 1000) });
              } else if (dir === "left") {
                const ev = eventMap.get(m.id);
                if (!ev) return;
                const oldStartSec = (ev.typingStart >= 0 ? ev.typingStart : ev.revealStart) / FPS;
                const deltaSec = start - oldStartSec;
                const newDelay = Math.max(0, Math.round((m.delayMs / 1000 - deltaSec) * 1000));
                onUpdateMessage(m.id, { delayMs: newDelay });
              }
            }}
            onActionMoveEnd={({ action, start }) => {
              const m = project.messages.find((msg) => msg.id === action.id);
              if (!m) return;
              const ev = eventMap.get(m.id);
              if (!ev) return;
              const oldStartSec = (ev.typingStart >= 0 ? ev.typingStart : ev.revealStart) / FPS;
              const deltaSec = start - oldStartSec;
              const newDelay = Math.max(0, Math.round((m.delayMs / 1000 + deltaSec) * 1000));
              onUpdateMessage(m.id, { delayMs: newDelay });
            }}
          />
        </div>
      </div>
    </div>
  );
}
