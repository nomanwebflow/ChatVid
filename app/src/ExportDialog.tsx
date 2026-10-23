import { useEffect, useRef, useState } from "react";
import type { Project } from "./types";
import { framesToSeconds } from "./timeline";
import { X, TriangleAlert, Film, Image } from "lucide-react";

type Props = { project: Project; totalFrames: number; onClose: () => void };
type Phase = "settings" | "queued" | "preparing" | "rendering" | "finalizing" | "completed" | "failed";
type Mode = "video" | "image";

const LABEL: Record<string, string> = {
  queued: "Queued…", preparing: "Preparing…", rendering: "Rendering frames…",
  finalizing: "Finalizing…", completed: "Done", failed: "Failed",
};

export function ExportDialog({ project, totalFrames, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("video");
  const [phase, setPhase] = useState<Phase>("settings");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [shooting, setShooting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const durationS = framesToSeconds(totalFrames);

  // Screenshot: render one frame server-side and download the PNG directly.
  async function shoot() {
    setError(null); setShooting(true);
    try {
      const r = await fetch("/api/stills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, schemaVersion: 1, project }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Could not render the screenshot.");
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "chatvid.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The render server is not reachable. Run: npm run server");
    } finally {
      setShooting(false);
    }
  }

  async function start() {
    setError(null); setProgress(0); setPhase("queued");
    try {
      const r = await fetch("/api/renders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, schemaVersion: 1, project }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not start render.");
      setJobId(data.id);
    } catch (e) {
      setPhase("failed");
      setError(e instanceof Error ? e.message : "The render server is not reachable. Run: npm run server");
    }
  }

  // poll job status
  useEffect(() => {
    if (!jobId) return;
    const tick = async () => {
      try {
        const r = await fetch(`/api/renders/${jobId}`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Lost the render job.");
        setProgress(d.progress || 0);
        setPhase(d.status as Phase);
        if (d.status === "completed" || d.status === "failed") {
          if (d.status === "failed") setError(d.error || "Render failed.");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch (e) {
        setPhase("failed");
        setError(e instanceof Error ? e.message : "Lost connection to the render server.");
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    tick();
    pollRef.current = window.setInterval(tick, 700);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [jobId]);

  const working = phase === "queued" || phase === "preparing" || phase === "rendering" || phase === "finalizing";
  const pct = Math.round((phase === "completed" ? 1 : progress) * 100);

  useEffect(() => {
    if (working) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [working, onClose]);

  const busy = working || shooting;
  const canSwitch = phase === "settings" || phase === "failed" || phase === "completed";

  function pickMode(m: Mode) {
    if (busy) return;
    setMode(m); setError(null); setPhase("settings"); setJobId(null); setProgress(0);
  }

  return (
    <div className="scrim" onClick={busy ? undefined : onClose}>
      <div className="dialog" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Export {mode === "video" ? "video" : "screenshot"}</h3>
          {!busy && <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>}
        </div>
        <div className="dialog-body">
          <div className="export-modes" role="tablist" aria-label="Export type">
            <button role="tab" aria-selected={mode === "video"} className={mode === "video" ? "on" : ""}
              disabled={!canSwitch} onClick={() => pickMode("video")}>
              <Film size={15} /> Video
            </button>
            <button role="tab" aria-selected={mode === "image"} className={mode === "image" ? "on" : ""}
              disabled={!canSwitch} onClick={() => pickMode("image")}>
              <Image size={15} /> Screenshot
            </button>
          </div>

          <div className="export-specs">
            <div><span>Resolution</span><b>1080 × 1920</b></div>
            {mode === "video" ? (<>
              <div><span>Frame rate</span><b>30 FPS</b></div>
              <div><span>Format</span><b>MP4 · H.264</b></div>
              <div><span>Duration</span><b>{durationS.toFixed(1)}s</b></div>
            </>) : (<>
              <div><span>Format</span><b>PNG</b></div>
              <div><span>Frame</span><b>Final (all shown)</b></div>
            </>)}
          </div>

          {phase === "settings" && mode === "video" && (
            <p className="hint">Renders the exact preview on the server as a 1080×1920 MP4.</p>
          )}
          {phase === "settings" && mode === "image" && (
            <p className="hint">Captures the final frame — every message revealed — as a full-resolution PNG.</p>
          )}

          {mode === "video" && (working || phase === "completed") && (
            <div className="export-progress">
              <div className="ep-bar"><div className="ep-fill" style={{ width: `${pct}%` }} /></div>
              <div className="ep-row"><span>{LABEL[phase] || phase}</span><b>{pct}%</b></div>
            </div>
          )}

          {error && <p className="warn" style={{ marginTop: 14 }}><TriangleAlert size={13} /> {error}</p>}
        </div>
        <div className="dialog-foot">
          {mode === "image" ? (<>
            <button className="tb-btn" onClick={onClose} disabled={shooting}>Close</button>
            <button className="tb-btn primary" onClick={shoot} disabled={shooting}>
              {shooting ? "Rendering…" : "Download PNG"}
            </button>
          </>) : (<>
            {phase === "settings" && (<>
              <button className="tb-btn" onClick={onClose}>Cancel</button>
              <button className="tb-btn primary" onClick={start}>Start render</button>
            </>)}
            {working && <button className="tb-btn" disabled>Rendering…</button>}
            {phase === "completed" && (<>
              <button className="tb-btn" onClick={onClose}>Close</button>
              <a className="tb-btn primary" href={`/api/renders/${jobId}/download`}>Download MP4</a>
            </>)}
            {phase === "failed" && (<>
              <button className="tb-btn" onClick={onClose}>Close</button>
              <button className="tb-btn primary" onClick={start}>Retry</button>
            </>)}
          </>)}
        </div>
      </div>
    </div>
  );
}
