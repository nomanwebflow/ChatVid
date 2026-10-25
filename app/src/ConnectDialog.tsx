// Consent step of the MCP connector's OAuth flow: Claude sends the browser to /?connect=1&...,
// and a signed-in (non-guest) user allows or denies it here.
import { useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { TriangleAlert, X } from "lucide-react";

type Props = { params: URLSearchParams; userName: string; onClose: () => void };

export function ConnectDialog({ params, userName, onClose }: Props) {
  const token = useAuthToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirect = params.get("redirect_uri") || "";
  let host = redirect;
  try { host = new URL(redirect).host; } catch { /* shown raw */ }

  async function allow() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(Object.fromEntries(params)),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not connect.");
      window.location.href = d.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect.");
      setBusy(false);
    }
  }

  function deny() {
    try {
      const u = new URL(redirect);
      u.searchParams.set("error", "access_denied");
      const state = params.get("state");
      if (state) u.searchParams.set("state", state);
      window.location.href = u.toString();
    } catch { onClose(); }
  }

  return (
    <div className="scrim">
      <div className="dialog" style={{ width: "min(460px,100%)" }}>
        <div className="dialog-head">
          <h3>Connect Claude to ChatVid</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="dialog-body">
          <p>Allow the app at <b>{host}</b> to create chats and render videos as <b>{userName}</b>.</p>
          <p className="hint">You can stop it any time by removing the connector in Claude.</p>
          {error && <p className="warn"><TriangleAlert size={13} /> {error}</p>}
        </div>
        <div className="dialog-foot">
          <button className="tb-btn" onClick={deny} disabled={busy}>Deny</button>
          <button className="tb-btn primary" onClick={allow} disabled={busy}>{busy ? "Connecting…" : "Allow"}</button>
        </div>
      </div>
    </div>
  );
}
