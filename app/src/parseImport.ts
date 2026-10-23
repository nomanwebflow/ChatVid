// Paste-to-import parser. Treats input as PLAIN TEXT (never HTML).
// Recognizes "Speaker: message" lines, preserves multiline bodies, flags
// lines with no recognizable speaker instead of discarding them.
export type ParsedLine = {
  speaker: string | null; // null = continuation / unrecognized
  text: string;
  time: string;           // per-message timestamp, e.g. "9:45 PM" ("" if none)
  ambiguous: boolean;     // no speaker and not a clear continuation
};

export type ParseResult = {
  lines: ParsedLine[];
  speakers: string[];     // distinct recognized speakers, in first-seen order
  warnings: string[];
  messageCount: number;
};

// Speaker prefix: up to ~24 chars, no line breaks, followed by a colon.
const SPEAKER_RE = /^\s*([^\n:]{1,24}):\s?(.*)$/;

// A leading timestamp from common WhatsApp export shapes. Returns the time
// string (e.g. "9:45 PM") and the remaining line with the stamp removed.
// Handles: "[9:45 PM] ", "[10/23/26, 9:45 PM] ", "9:45 PM - ",
// "10/23/26, 9:45 PM - ", "23/10/2026 21:45 - ", "9:45 - ".
const TIME_RE = /(\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp]\.?[Mm]\.?)?)/;
function stripTimestamp(line: string): { time: string; rest: string } {
  // bracketed:  [ ... <time> ]
  let m = line.match(/^\s*\[([^\]]*?)\]\s*(.*)$/);
  if (m) {
    const t = m[1].match(TIME_RE);
    if (t) return { time: normTime(t[1]), rest: m[2] };
  }
  // "<date/time> - <rest>"  (date optional)
  m = line.match(/^\s*(.*?)\s[-–]\s(.*)$/);
  if (m) {
    const t = m[1].match(TIME_RE);
    // only treat the prefix as a stamp if it is date/time-ish (has a colon time)
    if (t && /^[\d/.,:\s APMapm–-]+$/.test(m[1])) return { time: normTime(t[1]), rest: m[2] };
  }
  return { time: "", rest: line };
}
// tidy "9:45 pm" / "9:45PM" -> "9:45 PM"
function normTime(s: string): string {
  const m = s.trim().match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s?([AaPp]\.?[Mm]\.?)?$/);
  if (!m) return s.trim();
  const ap = m[2] ? " " + m[2].replace(/\./g, "").toUpperCase() : "";
  return m[1] + ap;
}

export function parseConversation(raw: string): ParseResult {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: ParsedLine[] = [];
  const speakers: string[] = [];
  const warnings: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      // blank line -> paragraph break inside the previous message, if any
      if (out.length && out[out.length - 1].speaker !== null) {
        out[out.length - 1].text += "\n";
      }
      continue;
    }
    const { time, rest } = stripTimestamp(line);
    const m = rest.match(SPEAKER_RE);
    if (m) {
      const speaker = m[1].trim();
      if (!speakers.includes(speaker)) speakers.push(speaker);
      out.push({ speaker, text: m[2], time, ambiguous: false });
    } else if (out.length && out[out.length - 1].speaker !== null) {
      // continuation of the previous speaker's message (timestamp, if any, ignored)
      out[out.length - 1].text += (out[out.length - 1].text ? "\n" : "") + line;
    } else {
      out.push({ speaker: null, text: line, time, ambiguous: true });
    }
  }

  const ambiguousCount = out.filter((l) => l.ambiguous).length;
  if (ambiguousCount) warnings.push(`${ambiguousCount} line(s) had no recognizable speaker.`);
  if (speakers.length > 5) warnings.push(`${speakers.length} speakers found; only 5 participants are supported.`);

  return {
    lines: out.map((l) => ({ ...l, text: l.text.replace(/\n+$/, "") })),
    speakers,
    warnings,
    messageCount: out.filter((l) => l.speaker !== null).length,
  };
}
