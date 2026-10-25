import { useState, useRef, useEffect } from "react";
import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import {
  LogIn,
  LogOut,
  FolderKanban,
  Sparkles,
  ChevronDown,
  UserPlus,
} from "lucide-react";

type Props = {
  onOpenProjects: () => void;
  onOpenAuth: (mode?: "signIn" | "signUp") => void;
};

export function UserMenu({ onOpenProjects, onOpenAuth }: Props) {
  const viewer = useQuery(api.users.viewer);
  const { signOut } = useAuthActions();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  // Loading state
  if (viewer === undefined) {
    return (
      <div className="user-menu-loading" aria-label="Loading user account">
        <span className="user-avatar skeleton" />
      </div>
    );
  }

  // Not signed in
  if (viewer === null) {
    return (
      <div className="user-menu-wrap">
        <button
          type="button"
          className="tb-btn auth-trigger-btn"
          onClick={() => onOpenAuth("signIn")}
          title="Sign in to save projects to cloud"
        >
          <LogIn size={14} />
          <span className="lbl">Sign In</span>
        </button>
      </div>
    );
  }

  const initials = viewer.name
    ? viewer.name
        .split(" ")
        .map((p) => p[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <div className="user-menu-wrap" ref={menuRef}>
      <button
        type="button"
        className={`user-btn ${dropdownOpen ? "active" : ""}`}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-expanded={dropdownOpen}
        aria-haspopup="true"
        title={viewer.email ?? viewer.name ?? "Account"}
      >
        <span className={`user-avatar ${viewer.isAnonymous ? "guest-avatar" : ""}`}>
          {viewer.isAnonymous ? <Sparkles size={13} /> : initials}
        </span>
        <span className="user-name-label">
          {viewer.isAnonymous ? "Guest Creator" : viewer.name}
        </span>
        {viewer.isAnonymous && <span className="user-badge-guest">Guest</span>}
        <ChevronDown size={12} className="user-chevron" />
      </button>

      {dropdownOpen && (
        <div className="user-dropdown" role="menu">
          <div className="user-dropdown-header">
            <div className="user-dropdown-profile">
              <span className={`user-avatar lg ${viewer.isAnonymous ? "guest-avatar" : ""}`}>
                {viewer.isAnonymous ? <Sparkles size={16} /> : initials}
              </span>
              <div className="user-dropdown-details">
                <div className="user-dropdown-name">{viewer.name}</div>
                {viewer.email ? (
                  <div className="user-dropdown-email">{viewer.email}</div>
                ) : (
                  <div className="user-dropdown-guest-badge">
                    <Sparkles size={11} /> Guest Session
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="user-dropdown-divider" />

          <button
            type="button"
            className="user-dropdown-item"
            role="menuitem"
            onClick={() => {
              setDropdownOpen(false);
              onOpenProjects();
            }}
          >
            <FolderKanban size={15} />
            <span>My Cloud Projects</span>
          </button>

          {viewer.isAnonymous && (
            <button
              type="button"
              className="user-dropdown-item highlight"
              role="menuitem"
              onClick={() => {
                setDropdownOpen(false);
                onOpenAuth("signUp");
              }}
            >
              <UserPlus size={15} />
              <div className="item-with-desc">
                <span>Save to Permanent Account</span>
                <small>Keep all reels permanently</small>
              </div>
            </button>
          )}

          <div className="user-dropdown-divider" />

          <button
            type="button"
            className="user-dropdown-item danger"
            role="menuitem"
            onClick={async () => {
              setDropdownOpen(false);
              await signOut();
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}
