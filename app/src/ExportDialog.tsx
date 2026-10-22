import { useEffect, useRef, useState } from "react";
import type { Project } from "./types";
import { framesToSeconds } from "./timeline";
import { X, TriangleAlert } from "lucide-react";

type Props = { project: Project; totalFrames: number; onClose: () => void };
type Phase = "settings" | "queued" | "preparing" | "rendering" | "finalizing" | "completed" | "failed";

const LABEL: Record<string, string> = {
  queued: "Queued…", preparing: "Preparing…", rendering: "Rendering frames…",
  finalizing: "Finalizing…", completed: "Done", failed: "Failed",
};

export function ExportDialog({ project, totalFrames, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>("settings");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const durationS = framesToSeconds(totalFrames);

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

  return (
    <div className="scrim" onClick={working ? undefined : onClose}>
      <div className="dialog" style={{ width: "min(460px,100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head">
          <h3>Export video</h3>
          {!working && <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>}
        </div>
        <div className="dialog-body">
          <div className="export-specs">
            <div><span>Resolution</span><b>1080 × 1920</b></div>
            <div><span>Frame rate</span><b>30 FPS</b></div>
            <div><span>Format</span><b>MP4 · H.264</b></div>
            <div><span>Duration</span><b>{durationS.toFixed(1)}s</b></div>
          </div>

          {phase === "settings" && (
            <p className="hint">Renders the exact preview on the local server. Start it first with <code>npm run server</code> (or <code>npm run dev:all</code>).</p>
          )}

          {(working || phase === "completed") && (
            <div className="export-progress">
              <div className="ep-bar"><div className="ep-fill" style={{ width: `${pct}%` }} /></div>
              <div className="ep-row"><span>{LABEL[phase] || phase}</span><b>{pct}%</b></div>
            </div>
          )}

          {phase === "failed" && error && <p className="warn" style={{ marginTop: 14 }}><TriangleAlert size={13} /> {error}</p>}
        </div>
        <div className="dialog-foot">
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
        </div>
      </div>
    </div>
  );
}
