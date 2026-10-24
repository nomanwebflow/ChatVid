// WhatsApp voice-message bubble, built to the Figma "Vocal" spec.
//   mine:   avatar | [play + waveform / duration + time + tick]   grey knob
//   theirs: [play + waveform / duration + time] | avatar          blue knob
// The waveform, knob, elapsed time and play/pause icon are driven by the frame number,
// so the preview and the exported video play the note identically.
import { staticFile } from "remotion";
import type { Message } from "../types";
import type { Event } from "../timeline";
import { DESIGN_PEAKS, WAVE_BARS, fmtVoiceTime } from "../voice";
import { TailMe, TailThem } from "./svg";

const A = (name: string) => staticFile(`figma/${name}`);

// knob travels from its start offset (-5px) to the far end of the 161px waveform
const KNOB_START = -5;
const KNOB_TRAVEL = 159;

type Props = {
  m: Message;
  ev: Event;
  frame: number;
  mine: boolean;
  avatarSrc: string;
  ts: string;
  lastOfRun: boolean;
};

export function VoiceBubble({ m, ev, frame, mine, avatarSrc, ts, lastOfRun }: Props) {
  const voice = m.voice!;
  const total = ev.voiceEnd - ev.voiceStart;
  const playing = frame >= ev.voiceStart && frame < ev.voiceEnd;
  const p = playing && total > 0 ? (frame - ev.voiceStart) / total : 0;
  const peaks = voice.peaks.length === WAVE_BARS ? voice.peaks : DESIGN_PEAKS;
  // idle: whole length; while playing: elapsed, like WhatsApp
  const label = fmtVoiceTime(playing ? p * voice.durationMs : voice.durationMs);

  const avatar = (
    <div className="vocal-avatar">
      <img className="vocal-pic" src={avatarSrc} alt="" />
      <img className="vocal-mic" src={A(mine ? "voice-mic-me.svg" : "voice-mic-friend.svg")} width={24} height={24} alt="" />
    </div>
  );

  const main = (
    <div className="vocal-main">
      <div className="vocal-play">
        <img src={A(playing ? "voice-pause.svg" : "voice-play.svg")} width={24} height={24} alt="" />
        <div className="vocal-sound">
          <div className="vocal-wave">
            {peaks.map((v, i) => (
              <i key={i} className={playing && (i + 0.5) / WAVE_BARS <= p ? "on" : ""} style={{ height: 4 + Math.max(0, Math.min(1, v)) * 20 }} />
            ))}
          </div>
          <div className="vocal-knob" style={{ left: KNOB_START + p * KNOB_TRAVEL }} />
        </div>
      </div>
      <div className="vocal-time">
        <span>{label}</span>
        <span className="vt-right">
          {ts}
          {mine && m.readReceipt && <img src={A("check-read.svg")} width={17} height={17} alt="" />}
        </span>
      </div>
    </div>
  );

  return (
    <div className={`bubble bubble-voice ${mine ? "bubble-me" : "bubble-them"}`}>
      {lastOfRun && (mine ? <div className="tail-me"><TailMe /></div> : <div className="tail-them"><TailThem /></div>)}
      <div className={`vocal ${mine ? "vocal-me" : "vocal-them"}`}>
        {mine ? <>{avatar}{main}</> : <>{main}{avatar}</>}
      </div>
    </div>
  );
}
