import { useState, type FormEvent } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { X, User, Mail, Lock, Loader2, Sparkles, AlertCircle } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: "signIn" | "signUp";
  onSuccess?: () => void;
};

export function AuthModal({ isOpen, onClose, defaultMode = "signIn", onSuccess }: Props) {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">(defaultMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "signUp") {
        if (!name.trim()) {
          throw new Error("Please enter your name");
        }
        if (password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }
        await signIn("password", {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          flow: "signUp",
        });
      } else {
        await signIn("password", {
          email: email.trim().toLowerCase(),
          password,
          flow: "signIn",
        });
      }
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed. Please check your credentials.";
      setError(msg.replace("Uncaught Error: ", ""));
    } finally {
      setLoading(false);
    }
  }

  async function handleGuestSignIn() {
    setError(null);
    setGuestLoading(true);
    try {
      await signIn("anonymous");
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to continue as guest.";
      setError(msg);
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <div className="dialog-head">
          <div className="auth-brand-badge">
            <span className="dot" aria-hidden="true" />
            <span id="auth-title">
              {mode === "signIn" ? "Welcome back to ChatVid" : "Create your ChatVid account"}
            </span>
          </div>
          <button className="tb-btn icon-only" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="dialog-body">
          {/* Tab buttons */}
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signIn"}
              className={`auth-tab ${mode === "signIn" ? "active" : ""}`}
              onClick={() => { setMode("signIn"); setError(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signUp"}
              className={`auth-tab ${mode === "signUp" ? "active" : ""}`}
              onClick={() => { setMode("signUp"); setError(null); }}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="auth-error-banner" role="alert">
              <AlertCircle size={15} className="error-icon" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === "signUp" && (
              <div className="auth-field">
                <label htmlFor="auth-name">Full Name</label>
                <div className="auth-input-wrap">
                  <User size={15} className="auth-input-icon" />
                  <input
                    id="auth-name"
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="auth-field">
              <label htmlFor="auth-email">Email Address</label>
              <div className="auth-input-wrap">
                <Mail size={15} className="auth-input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-input-wrap">
                <Lock size={15} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  placeholder={mode === "signUp" ? "At least 6 characters" : "••••••••"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                />
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading || guestLoading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{mode === "signIn" ? "Signing In…" : "Creating Account…"}</span>
                </>
              ) : (
                <span>{mode === "signIn" ? "Sign In" : "Get Started"}</span>
              )}
            </button>
          </form>

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-guest-box">
            <button
              type="button"
              className="auth-guest-btn"
              onClick={handleGuestSignIn}
              disabled={loading || guestLoading}
            >
              {guestLoading ? (
                <>
                  <Loader2 size={15} className="spin" />
                  <span>Setting up guest session…</span>
                </>
              ) : (
                <>
                  <Sparkles size={15} className="guest-sparkle" />
                  <span>Continue as Guest Creator</span>
                </>
              )}
            </button>
            <p className="auth-guest-hint">
              Work right away. You can upgrade to a permanent email account anytime without losing any chat reels.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
