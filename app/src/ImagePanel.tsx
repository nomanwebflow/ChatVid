// Inspector panel for a message's photo: add, replace or remove it. The message text above
// becomes the caption (leave it empty for none).
import { useState } from "react";
import { ImagePlus, Trash2, TriangleAlert } from "lucide-react";
import type { Message } from "./types";
import { IMAGE_ACCEPT, imageFromFile } from "./image";

const IC = 14;

type Props = {
  m: Message;
  onChange: (id: string, patch: Partial<Message>, squash?: boolean) => void;
};

export function ImagePanel({ m, onChange }: Props) {
  const im = m.image;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setBusy(true); setError(null);
    try {
      const image = await imageFromFile(file);
      // placeholder texts from other message types would show up as a caption: clear them
      const text = m.text === "New message" || m.text === "Voice message" ? "" : m.text;
      onChange(m.id, { image, voice: undefined, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field image-panel">
      <label>Photo</label>
      {im && (
        <div className="voice-card image-card">
          <img className="image-thumb" src={im.src} alt="" />
          <div className="image-meta">
            <span className="image-name" title={im.name}>{im.name || "Photo"}</span>
            <span className="voice-dur">{im.width} × {im.height}</span>
          </div>
        </div>
      )}
      <div className="voice-actions">
        <label className={`tb-btn file-btn${busy ? " is-disabled" : ""}`} title="Upload a PNG, JPG, WebP or GIF (up to 15 MB)">
          <ImagePlus size={IC} /> {im ? "Replace" : "Add photo"}
          <input type="file" accept={IMAGE_ACCEPT} onChange={onFile} disabled={busy} hidden />
        </label>
        {im && (
          <button type="button" className="tb-btn" disabled={busy} title="Turn back into a text message"
            onClick={() => onChange(m.id, { image: undefined, text: m.text || "New message" })}>
            <Trash2 size={IC} /> Remove
          </button>
        )}
      </div>
      <p className="hint">
        {busy ? "Processing the image…"
          : im ? "The message text above is the caption. Leave it empty for no caption: the time then sits on the photo."
               : "Turn this into a photo message. The message text becomes its caption."}
      </p>
      {error && <p className="warn"><TriangleAlert size={13} /> {error}</p>}
    </div>
  );
}
