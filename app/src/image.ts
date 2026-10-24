// Photo helpers: turn an uploaded image file into an ImageAttachment (a downscaled data
// URI plus its size). Runs in the editor only.
import type { ImageAttachment } from "./types";

export const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
export const MAX_IMAGE_INPUT_BYTES = 15 * 1024 * 1024; // 15 MB in
const MAX_SIDE = 1400;                                  // the bubble is 242 css px wide; 1400 stays sharp in the 1080px video
const MAX_PNG_CHARS = 4_000_000;                        // a PNG data URI bigger than this falls back to JPEG

export const isImageFile = (f: File) => /^image\/(png|jpe?g|webp|gif)$/.test(f.type);

// Decode, apply the camera's EXIF rotation, shrink to MAX_SIDE, re-encode. PNG/WebP/GIF keep
// their transparency (as PNG) unless that gets huge; JPEGs stay JPEG. Animated GIFs become
// their first frame. Throws a user-readable Error.
export async function imageFromFile(file: File): Promise<ImageAttachment> {
  if (!isImageFile(file)) throw new Error("Please choose a PNG, JPG, WebP or GIF image.");
  if (file.size > MAX_IMAGE_INPUT_BYTES) throw new Error("Image must be under 15 MB.");

  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Could not read that image."); }

  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const width = Math.max(1, Math.round(bmp.width * k));
  const height = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) { bmp.close(); throw new Error("Could not process that image."); }

  let src = "";
  if (file.type !== "image/jpeg") {
    ctx.drawImage(bmp, 0, 0, width, height);
    src = canvas.toDataURL("image/png");
  }
  if (!src || src.length > MAX_PNG_CHARS) {
    // JPEG has no alpha: flatten onto white
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bmp, 0, 0, width, height);
    src = canvas.toDataURL("image/jpeg", 0.9);
  }
  bmp.close();
  return { src, width, height, name: file.name };
}
