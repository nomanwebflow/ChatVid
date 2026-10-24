// WhatsApp photo bubble, built to the Figma "Media + Caption" spec: a 250px bubble with 4px
// padding around a rounded 242px-wide photo, then the caption. With no caption the time sits
// on the photo over a soft dark gradient (as the design does for media-only bubbles).
import { Img, staticFile } from "remotion";
import type { Message } from "../types";
import { CheckTick, TailMe, TailThem } from "./svg";

const MEDIA_W = 242;
const MIN_H = 110;  // very wide photos
const MAX_H = 320;  // very tall photos: cropped to fit, like WhatsApp

// data/http URIs show as-is (editor); the render server swaps data URIs for files in the
// bundle's public folder, which staticFile() resolves
function imageSrc(src: string): string {
  if (/^(data:|https?:|blob:)/.test(src)) return src;
  return staticFile(src.replace(/^\//, ""));
}

type Props = { m: Message; mine: boolean; ts: string; lastOfRun: boolean };

export function ImageBubble({ m, mine, ts, lastOfRun }: Props) {
  const im = m.image!;
  const caption = m.text.trim() ? m.text : "";
  const ratio = im.width > 0 && im.height > 0 ? im.height / im.width : 1;
  const mediaH = Math.round(Math.max(MIN_H, Math.min(MAX_H, MEDIA_W * ratio)));
  const hasReceipt = mine && !!m.readReceipt;
  const cls = [
    "bubble", "bubble-image", mine ? "bubble-me" : "bubble-them",
    caption ? "" : "no-caption",
    hasReceipt ? "has-receipt" : "",
    !ts && !hasReceipt ? "no-ts" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={cls}>
      {lastOfRun && (mine ? <div className="tail-me"><TailMe /></div> : <div className="tail-them"><TailThem /></div>)}
      <div className="media" style={{ height: mediaH }}>
        {im.src ? <Img className="media-img" src={imageSrc(im.src)} /> : null}
        {!caption && (ts || hasReceipt) && (
          <div className="media-time">
            <span className="media-time-text">{ts}{hasReceipt && <img src={staticFile("figma/check-read.svg")} width={17} height={17} alt="" />}</span>
          </div>
        )}
      </div>
      {caption && (
        <>
          <div className="media-caption">
            <span className="bubble-text">{caption}</span><span className="ts-gap" aria-hidden="true">{ts}</span>
          </div>
          <div className="ts">{ts} {hasReceipt && <div className="check"><CheckTick /></div>}</div>
        </>
      )}
    </div>
  );
}
