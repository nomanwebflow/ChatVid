// iOS keyboard shown while "You" type a message (Figma 170-3074). Frame-driven: `typed` is the
// text so far, and the key for its last character is pressed with the magnified popup above it.
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
export const KB_HEIGHT = 336;

const Smiley = () => (
  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#000" strokeWidth="1.6" strokeLinecap="round">
    <circle cx="13" cy="13" r="10" /><circle cx="9.6" cy="10.8" r=".6" fill="#000" /><circle cx="16.4" cy="10.8" r=".6" fill="#000" />
    <path d="M8.5 15.2c1.2 2.2 3 3.1 4.5 3.1s3.3-.9 4.5-3.1" />
  </svg>
);
const Mic = () => (
  <svg width="22" height="28" viewBox="0 0 22 28" fill="none" stroke="#000" strokeWidth="1.7" strokeLinecap="round">
    <rect x="7.5" y="2" width="7" height="14" rx="3.5" /><path d="M3.5 12.5c0 4.2 3.2 7.5 7.5 7.5s7.5-3.3 7.5-7.5M11 20v5" />
  </svg>
);
const Shift = () => (<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#000" strokeWidth="1.7" strokeLinejoin="round"><path d="M10 2.5 2.5 10.5h4.2v6h6.6v-6h4.2z" /></svg>);
const Del = () => (<svg width="26" height="20" viewBox="0 0 26 20" fill="none" stroke="#000" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round"><path d="M8.5 2h14a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-14L1.5 10z" /><path d="m13 7 6 6m0-6-6 6" /></svg>);

type Props = { typed: string; pressedAt: number; scale?: number };

// pressedAt: 1 while the last character's key is down, fading to 0
export function IOSKeyboard({ typed, pressedAt, scale = 1 }: Props) {
  const chars = Array.from(typed);
  const last = chars[chars.length - 1] || "";
  const pressed = pressedAt > 0 ? last.toLowerCase() : "";
  const word = typed.split(/\s+/).pop() || "";
  const sug = word && !typed.endsWith(" ") ? [`“${word}”`, "the", "to"] : ["I", "The", "I’m"];

  const key = (ch: string, cls = "") => (
    <span key={ch} className={`kb-key ${cls}${pressed === ch ? " down" : ""}`}>
      {ch}
      {pressed === ch && <span className="kb-pop">{last}</span>}
    </span>
  );

  return (
    <div className="kb" style={{ height: KB_HEIGHT, width: 393 / scale, transform: `scale(${scale})` }}>
      <div className="kb-sug">{sug.map((s, i) => <span key={i} className={i === 0 ? "first" : ""}>{s}</span>)}</div>
      <div className="kb-row">{ROWS[0].split("").map((c) => key(c))}</div>
      <div className="kb-row inset">{ROWS[1].split("").map((c) => key(c))}</div>
      <div className="kb-row">
        <span className="kb-key fn wide"><Shift /></span>
        <div className="kb-mid">{ROWS[2].split("").map((c) => key(c))}</div>
        <span className="kb-key fn wide"><Del /></span>
      </div>
      <div className="kb-row">
        <span className="kb-key fn abc">ABC</span>
        <span className={`kb-key space${pressed === " " ? " down" : ""}`}>space</span>
        <span className="kb-key fn ret">return</span>
      </div>
      <div className="kb-foot"><Smiley /><Mic /></div>
    </div>
  );
}
