import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Project } from "./types";
import {
  X,
  Plus,
  Trash2,
  Copy,
  Share2,
  Check,
  FolderOpen,
  FolderKanban,
  Clock,
  MessageSquare,
  Users,
  Globe,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  currentProjectId: string;
  onSelectProject: (project: Project) => void;
  onCreateNew: () => void;
  onOpenAuth: () => void;
};

function fmtRelativeTime(iso: string) {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  } catch {
    return "Recently";
  }
}

export function ProjectsModal({
  isOpen,
  onClose,
  currentProjectId,
  onSelectProject,
  onCreateNew,
  onOpenAuth,
}: Props) {
  const viewer = useQuery(api.users.viewer);
  const projects = useQuery(api.projects.list);
  const removeMutation = useMutation(api.projects.remove);
  const duplicateMutation = useMutation(api.projects.duplicate);
  const setPublicMutation = useMutation(api.projects.setPublic);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleDuplicate(p: any) {
    setBusyAction(`dup-${p.projectId}`);
    try {
      const newProjectId = "proj_" + Math.random().toString(36).slice(2, 9);
      await duplicateMutation({
        projectId: p.projectId,
        newProjectId,
        newTitle: `${p.title} (Copy)`,
      });
    } catch (err) {
      console.error("Duplicate failed", err);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDelete(projectId: string) {
    setBusyAction(`del-${projectId}`);
    try {
      await removeMutation({ projectId });
      setDeletingId(null);
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setBusyAction(null);
    }
  }

  async function handleShare(p: any) {
    try {
      const nextPublic = !p.isPublic;
      await setPublicMutation({ projectId: p.projectId, isPublic: nextPublic });
      if (nextPublic) {
        const url = `${window.location.origin}${window.location.pathname}?project=${p.projectId}`;
        await navigator.clipboard.writeText(url);
        setCopiedId(p.projectId);
        setTimeout(() => setCopiedId(null), 2500);
      }
    } catch (err) {
      console.error("Share failed", err);
    }
  }

  function handleOpen(raw: any) {
    const proj: Project = {
      schemaVersion: raw.schemaVersion ?? 1,
      id: raw.projectId,
      title: raw.title ?? "Untitled reel",
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      participants: raw.participants ?? [],
      messages: raw.messages ?? [],
      appearance: raw.appearance,
      exportSettings: raw.exportSettings,
    };
    onSelectProject(proj);
    onClose();
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog projects-dialog" role="dialog" aria-modal="true" aria-labelledby="pm-title">
        <div className="dialog-head">
          <div className="pm-head-left">
            <FolderKanban size={20} className="pm-head-icon" />
            <div>
              <h3 id="pm-title">Cloud Projects</h3>
              <p className="pm-subtitle">Multi-user cloud storage with real-time sync</p>
            </div>
          </div>
          <div className="pm-head-actions">
            {viewer && (
              <button
                type="button"
                className="tb-btn primary"
                onClick={() => {
                  onCreateNew();
                  onClose();
                }}
              >
                <Plus size={15} />
                <span>New Project</span>
              </button>
            )}
            <button className="tb-btn icon-only" onClick={onClose} aria-label="Close dialog">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="dialog-body pm-body">
          {!viewer && (
            <div className="pm-anon-banner">
              <div className="pm-anon-text">
                <strong>Sign in to access Cloud Database</strong>
                <p>Save multiple projects, switch seamlessly, and sync across any device or browser.</p>
              </div>
              <button type="button" className="tb-btn primary" onClick={onOpenAuth}>
                Sign In or Register
              </button>
            </div>
          )}

          {viewer && projects === undefined && (
            <div className="pm-loading">
              <Loader2 size={24} className="spin" />
              <span>Loading cloud projects…</span>
            </div>
          )}

          {viewer && projects && projects.length === 0 && (
            <div className="pm-empty">
              <FolderOpen size={40} className="pm-empty-icon" />
              <h4>No cloud projects yet</h4>
              <p>Your current chat reel is automatically synced. Click below to create another reel!</p>
              <button
                type="button"
                className="tb-btn primary"
                onClick={() => {
                  onCreateNew();
                  onClose();
                }}
              >
                <Plus size={15} />
                <span>Create New Project</span>
              </button>
            </div>
          )}

          {viewer && projects && projects.length > 0 && (
            <div className="pm-grid">
              {projects.map((p) => {
                const isCurrent = p.projectId === currentProjectId;
                const isDeleting = deletingId === p.projectId;
                const isBusy = busyAction === `del-${p.projectId}` || busyAction === `dup-${p.projectId}`;

                return (
                  <div
                    key={p.projectId}
                    className={`pm-card ${isCurrent ? "is-current" : ""}`}
                  >
                    <div className="pm-card-top">
                      <div className="pm-card-title-row">
                        <h4 className="pm-card-title" title={p.title}>
                          {p.title}
                        </h4>
                        {isCurrent && (
                          <span className="pm-badge-active">Active</span>
                        )}
                        {p.isPublic && (
                          <span className="pm-badge-public" title="Public link enabled">
                            <Globe size={11} /> Public
                          </span>
                        )}
                      </div>
                      <div className="pm-card-meta">
                        <span title="Last updated">
                          <Clock size={12} /> {fmtRelativeTime(p.updatedAt)}
                        </span>
                        <span>•</span>
                        <span title="Message count">
                          <MessageSquare size={12} /> {p.messages?.length ?? 0} msgs
                        </span>
                        <span>•</span>
                        <span title="Participants">
                          <Users size={12} /> {p.participants?.length ?? 0}
                        </span>
                      </div>
                    </div>

                    <div className="pm-card-actions">
                      {isDeleting ? (
                        <div className="pm-delete-confirm">
                          <AlertTriangle size={13} className="del-alert" />
                          <span>Delete this project?</span>
                          <button
                            type="button"
                            className="tb-btn danger sm"
                            disabled={isBusy}
                            onClick={() => handleDelete(p.projectId)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="tb-btn sm"
                            onClick={() => setDeletingId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={`tb-btn sm ${isCurrent ? "" : "primary"}`}
                            disabled={isCurrent}
                            onClick={() => handleOpen(p)}
                          >
                            {isCurrent ? "Editing" : "Open"}
                          </button>

                          <button
                            type="button"
                            className="tb-btn sm icon-only"
                            title="Duplicate project"
                            disabled={isBusy}
                            onClick={() => handleDuplicate(p)}
                          >
                            {busyAction === `dup-${p.projectId}` ? (
                              <Loader2 size={13} className="spin" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>

                          <button
                            type="button"
                            className={`tb-btn sm icon-only ${p.isPublic ? "active" : ""}`}
                            title={p.isPublic ? "Public link copied! Click to make private" : "Make public & copy link"}
                            onClick={() => handleShare(p)}
                          >
                            {copiedId === p.projectId ? (
                              <Check size={13} className="share-check" />
                            ) : p.isPublic ? (
                              <Globe size={13} />
                            ) : (
                              <Share2 size={13} />
                            )}
                          </button>

                          <button
                            type="button"
                            className="tb-btn sm icon-only danger-hover"
                            title="Delete project"
                            disabled={isBusy}
                            onClick={() => setDeletingId(p.projectId)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
