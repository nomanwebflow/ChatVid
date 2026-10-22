// Paste-to-import parser. Treats input as PLAIN TEXT (never HTML).
// Recognizes "Speaker: message" lines, preserves multiline bodies, flags
// lines with no recognizable speaker instead of discarding them.
export type ParsedLine = {
  speaker: string | null; // null = continuation / unrecognized
  text: string;
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
    const m = line.match(SPEAKER_RE);
    if (m) {
      const speaker = m[1].trim();
      if (!speakers.includes(speaker)) speakers.push(speaker);
      out.push({ speaker, text: m[2], ambiguous: false });
    } else if (out.length && out[out.length - 1].speaker !== null) {
      // continuation of the previous speaker's message
      out[out.length - 1].text += (out[out.length - 1].text ? "\n" : "") + line;
    } else {
      out.push({ speaker: null, text: line, ambiguous: true });
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
