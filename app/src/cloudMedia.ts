// Cloud saves keep media out of the Convex document (1 MB cap): data: URIs are uploaded to
// the VPS (POST /api/media) and replaced by their /api/media/<hash> URL in the saved copy.
// The local project (IndexedDB) keeps the data URIs untouched.
import type { Project } from "./types";

const uploaded = new Map<string, string>(); // data URI -> stored URL, so autosaves don't re-upload

async function upload(dataUri: string, token: string): Promise<string> {
  const hit = uploaded.get(dataUri);
  if (hit) return hit;
  const blob = await (await fetch(dataUri)).blob();
  const res = await fetch("/api/media", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": blob.type }, body: blob });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error || `Upload failed (${res.status})`);
  const { url } = (await res.json()) as { url: string };
  uploaded.set(dataUri, url);
  return url;
}

const isData = (s?: string): s is string => !!s && s.startsWith("data:");

export async function offloadMedia(p: Project, token: string | null) {
  const conv = async (s: string) => (token ? upload(s, token) : Promise.reject(new Error("Not signed in")));
  const messages = await Promise.all(p.messages.map(async (m) => {
    const out = { ...m };
    if (isData(m.voice?.src)) out.voice = { ...m.voice!, src: await conv(m.voice!.src) };
    if (isData(m.image?.src)) out.image = { ...m.image!, src: await conv(m.image!.src) };
    return out;
  }));
  const participants = await Promise.all(p.participants.map(async (x) => (isData(x.avatarUrl) ? { ...x, avatarUrl: await conv(x.avatarUrl) } : x)));
  const appearance = isData(p.appearance.wallpaperUrl) ? { ...p.appearance, wallpaperUrl: await conv(p.appearance.wallpaperUrl) } : p.appearance;
  return { messages, participants, appearance };
}
