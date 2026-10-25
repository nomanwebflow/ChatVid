// User dashboard (Untitled UI "vendor movements" layout, reworked for ChatVid): the signed-in
// user's cloud reels as a table. Styled with Tailwind utilities (see dashboard.css).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowDown, Download, Film, Home, ListFilter, LogOut, Pencil, Plus, Search, Trash2, Check, Minus, ChevronDown } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Project } from "../types";
import { FPS } from "../types";
import { buildTimeline } from "../timeline";
import { avatarDataUri } from "../composition/svg";
import { AuthModal } from "../AuthModal";
import "./dashboard.css";

type Cloud = NonNullable<ReturnType<typeof useQuery<typeof api.projects.list>>>[number];
type Tab = "all" | "public" | "private";
type Sort = "newest" | "oldest" | "longest" | "title";
const PAGE = 7;
const SORTS: { id: Sort; label: string }[] = [
  { id: "newest", label: "Last edited" }, { id: "oldest", label: "Oldest first" },
  { id: "longest", label: "Longest" }, { id: "title", label: "Title A-Z" },
];

type Row = { c: Cloud; seconds: number; messages: number; voice: boolean; photo: boolean; avatar: string };

function toRow(c: Cloud): Row {
  const p = { schemaVersion: 1, id: c.projectId, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt,
    participants: c.participants, messages: c.messages, appearance: c.appearance, exportSettings: c.exportSettings } as Project;
  let seconds = 0;
  try { seconds = buildTimeline(p).totalFrames / FPS; } catch { /* malformed project: show 0 */ }
  const left = c.participants.find((x: { side: string }) => x.side === "left") ?? c.participants[0];
  return {
    c, seconds, messages: c.messages.length,
    voice: c.messages.some((m: { voice?: unknown }) => !!m.voice), photo: c.messages.some((m: { image?: unknown }) => !!m.image),
    avatar: left?.avatarUrl || avatarDataUri(left?.color || "#25d366"),
  };
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtLen = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s` : `${Math.round(s)}s`);
const open = (id?: string) => { window.location.href = id ? `/?project=${id}` : "/?new=1"; };

const btn = "inline-flex items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-xs hover:bg-gray-50 cursor-pointer";
const btnPrimary = "inline-flex items-center justify-center gap-1 rounded-lg border border-brand-600 bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-700 cursor-pointer";

function Tag({ tone, children, dot }: { tone: "ok" | "gray" | "brand" | "pink" | "sky" | "amber"; children: React.ReactNode; dot?: boolean }) {
  const t = {
    ok: "border-ok-200 bg-ok-50 text-ok-700", gray: "border-gray-200 bg-gray-50 text-gray-700", brand: "border-brand-200 bg-brand-50 text-brand-700",
    pink: "border-pink-200 bg-pink-50 text-pink-700", sky: "border-sky-200 bg-sky-50 text-sky-700", amber: "border-amber-200 bg-amber-50 text-amber-700",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium ${t}`}>
      {dot && <i className={`size-1.5 rounded-full ${tone === "ok" ? "bg-ok-500" : "bg-gray-400"}`} />}{children}
    </span>
  );
}

function Check1({ on, partial, onClick, label }: { on: boolean; partial?: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={partial ? "mixed" : on} aria-label={label} onClick={onClick}
      className={`flex size-4 shrink-0 items-center justify-center rounded border cursor-pointer ${on || partial ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300 bg-white"}`}>
      {partial ? <Minus size={11} strokeWidth={3} /> : on ? <Check size={11} strokeWidth={3} /> : null}
    </button>
  );
}

const Logomark = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" aria-label="ChatVid" className="shadow-logo rounded-xl">
    <rect width="48" height="48" rx="12" fill="#7f56d9" />
    <path d="M14 17.5A3.5 3.5 0 0 1 17.5 14h13a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1-3.5 3.5H24l-6 5v-5h-.5A3.5 3.5 0 0 1 14 25.5z" fill="#fff" />
    <path d="M21 17.8v6.4l5.4-3.2z" fill="#7f56d9" />
  </svg>
);

function Sidebar({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const item = "flex size-12 items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-700";
  return (
    <aside className="flex h-screen w-20 shrink-0 flex-col justify-between border-r border-gray-200 bg-white">
      <div className="flex flex-col gap-6 pt-8">
        <a href="/" className="px-6" aria-label="Open the editor"><Logomark /></a>
        <nav className="flex flex-col gap-2 px-4" aria-label="Main">
          <a href="/dashboard" aria-current="page" title="Dashboard" className={`${item} bg-gray-50 text-gray-700`}><Home size={24} strokeWidth={1.75} /></a>
          <a href="/" title="Editor" className={item}><Film size={24} strokeWidth={1.75} /></a>
        </nav>
      </div>
      <div className="relative px-4 pb-6" ref={ref}>
        <button type="button" onClick={() => setMenu((v) => !v)} aria-label={`${name}: account menu`} aria-expanded={menu}
          className="relative block size-12 cursor-pointer overflow-hidden rounded-full ring-1 ring-black/10">
          <img src={avatarDataUri("#7f56d9")} alt="" className="size-full object-cover" />
        </button>
        {menu && (
          <div role="menu" className="absolute bottom-6 left-[72px] z-10 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-xs">
            <p className="truncate px-3.5 py-2 text-sm font-semibold text-gray-900">{name}</p>
            <button type="button" role="menuitem" onClick={onSignOut} className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`h-11 px-6 text-left text-xs font-medium text-gray-500 ${className}`}>{children}</th>;
}

export default function Dashboard() {
  const viewer = useQuery(api.users.viewer);
  const cloud = useQuery(api.projects.list);
  const remove = useMutation(api.projects.remove);
  const { signOut } = useAuthActions();
  const [authOpen, setAuthOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const filtersRef = useRef<HTMLDivElement>(null);

  useEffect(() => { document.title = "Dashboard · ChatVid"; }, []);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) setFilters(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  useEffect(() => { if (viewer === null) setAuthOpen(true); }, [viewer]);
  useEffect(() => setPage(0), [tab, q, sort]);

  const rows = useMemo(() => (cloud ?? []).map(toRow), [cloud]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((r) => (tab === "all" || (tab === "public") === !!r.c.isPublic) && (!needle || r.c.title.toLowerCase().includes(needle)));
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      newest: (a, b) => b.c.updatedAt.localeCompare(a.c.updatedAt), oldest: (a, b) => a.c.updatedAt.localeCompare(b.c.updatedAt),
      longest: (a, b) => b.seconds - a.seconds, title: (a, b) => a.c.title.localeCompare(b.c.title),
    };
    return list.sort(by[sort]);
  }, [rows, tab, q, sort]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const maxLen = Math.max(60, ...rows.map((r) => r.seconds));
  const allOn = pageRows.length > 0 && pageRows.every((r) => sel.has(r.c.projectId));
  const someOn = pageRows.some((r) => sel.has(r.c.projectId));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function del(ids: string[]) {
    if (!ids.length || !window.confirm(`Delete ${ids.length === 1 ? "this reel" : `${ids.length} reels`}? This can't be undone.`)) return;
    await Promise.all(ids.map((id) => remove({ projectId: id })));
    setSel(new Set());
  }

  function exportCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [["Title", "Seconds", "Messages", "Visibility", "Last edited"], ...shown.map((r) => [r.c.title, r.seconds.toFixed(1), r.messages, r.c.isPublic ? "Public" : "Private", r.c.updatedAt])]
      .map((l) => l.map(esc).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([csv], { type: "text/csv" })), download: "chatvid-reels.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  }

  const name = viewer?.name ?? "";
  const first = name.split(" ")[0] || "there";

  if (viewer === null) {
    return (
      <div className="dash flex min-h-screen items-center justify-center bg-white font-sans text-gray-900">
        <div className="max-w-sm px-8 text-center">
          <h1 className="text-3xl font-semibold">Your reels live here</h1>
          <p className="mt-2 text-base text-gray-500">Sign in to see the videos you saved to your account.</p>
          <div className="mt-6 flex justify-center gap-3">
            <button className={btnPrimary} onClick={() => setAuthOpen(true)}>Sign in</button>
            <a className={btn} href="/">Open the editor</a>
          </div>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    );
  }

  return (
    <div className="dash flex h-screen bg-white font-sans text-gray-900">
      <Sidebar name={name || "Account"} onSignOut={() => void signOut().then(() => { window.location.href = "/"; })} />
      <main className="flex min-w-0 flex-1 flex-col gap-8 overflow-y-auto rounded-tl-[40px] bg-white pt-8 pb-12">
        <header className="flex flex-wrap items-start gap-4 px-8">
          <h1 className="min-w-80 flex-1 text-3xl font-semibold leading-[38px]">{viewer ? `Welcome back, ${first}` : " "}</h1>
          <div className="flex items-center gap-3">
            <button type="button" aria-label="Search reels" onClick={() => searchRef.current?.focus()} className="flex size-10 cursor-pointer items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50"><Search size={20} /></button>
            <button type="button" className={btn} onClick={exportCsv} disabled={!shown.length}><Download size={20} /> Export list</button>
          </div>
        </header>

        <section className="px-8">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs">
            <div className="flex flex-col gap-5 pt-5">
              <div className="flex flex-wrap items-start gap-4 px-6">
                <div className="min-w-60 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold leading-7">Your reels</h2>
                    <span className="rounded-md border border-gray-300 bg-white px-1.5 py-0.5 text-xs font-medium text-gray-700">{rows.length} {rows.length === 1 ? "reel" : "reels"}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">Chat videos saved to your account. Open one to keep editing.</p>
                </div>
                <div className="flex items-center gap-3">
                  {sel.size > 0 && <button type="button" className={btn} onClick={() => del([...sel])}><Trash2 size={20} /> Delete {sel.size}</button>}
                  <button type="button" className={btn} onClick={() => open()}><Film size={20} /> Open editor</button>
                  <button type="button" className={btnPrimary} onClick={() => open()}><Plus size={20} /> New reel</button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 px-6 pb-5">
                <div role="tablist" aria-label="Visibility" className="inline-flex overflow-hidden rounded-lg border border-gray-300 shadow-xs">
                  {([["all", "View all"], ["public", "Public"], ["private", "Private"]] as [Tab, string][]).map(([id, label], i) => (
                    <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
                      className={`cursor-pointer px-4 py-2 text-sm font-semibold ${i ? "border-l border-gray-300" : ""} ${tab === id ? "bg-gray-50 text-gray-800" : "bg-white text-gray-700 hover:bg-gray-50"}`}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex w-72 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3.5 py-2.5 shadow-xs focus-within:border-brand-500">
                    <Search size={20} className="text-gray-500" />
                    <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search reels" className="min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-500" />
                  </label>
                  <div className="relative" ref={filtersRef}>
                    <button type="button" className={btn} aria-expanded={filters} onClick={() => setFilters((v) => !v)}><ListFilter size={20} /> Filters <ChevronDown size={16} className="text-gray-500" /></button>
                    {filters && (
                      <div role="menu" className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-xs">
                        {SORTS.map((s) => (
                          <button key={s.id} role="menuitemradio" aria-checked={sort === s.id} onClick={() => { setSort(s.id); setFilters(false); }}
                            className="flex w-full cursor-pointer items-center justify-between px-3.5 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50">
                            {s.label}{sort === s.id && <Check size={16} className="text-brand-600" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] border-collapse">
                <thead className="border-y border-gray-200 bg-gray-50">
                  <tr>
                    <Th className="w-12 pr-0"><Check1 on={allOn} partial={!allOn && someOn} label="Select all on this page" onClick={() => setSel((s) => { const n = new Set(s); pageRows.forEach((r) => (allOn ? n.delete(r.c.projectId) : n.add(r.c.projectId))); return n; })} /></Th>
                    <Th><span className="inline-flex items-center gap-1">Reel <ArrowDown size={14} className="text-gray-400" /></span></Th>
                    <Th>Length</Th><Th className="w-24" /><Th>Last edited</Th><Th>Tags</Th><Th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {viewer && cloud === undefined && <tr><td colSpan={7} className="h-40 text-center text-sm text-gray-500">Loading your reels…</td></tr>}
                  {cloud && !pageRows.length && (
                    <tr><td colSpan={7} className="h-48 text-center">
                      <p className="text-sm font-semibold text-gray-900">{rows.length ? "No reels match" : "No reels yet"}</p>
                      <p className="mt-1 text-sm text-gray-500">{rows.length ? "Try a different search or filter." : "Reels you save while signed in show up here."}</p>
                      {!rows.length && <button className={`${btnPrimary} mt-4`} onClick={() => open()}><Plus size={20} /> New reel</button>}
                    </td></tr>
                  )}
                  {pageRows.map((r) => {
                    const id = r.c.projectId;
                    const tags: { tone: "ok" | "gray" | "brand" | "pink" | "sky"; text: string; dot?: boolean }[] = [
                      { tone: r.c.isPublic ? "ok" : "gray", text: r.c.isPublic ? "Public" : "Private", dot: true },
                      ...(r.voice ? [{ tone: "brand" as const, text: "Voice" }] : []), ...(r.photo ? [{ tone: "pink" as const, text: "Photos" }] : []),
                      ...(r.c.appearance?.layout === "fullscreen" ? [{ tone: "sky" as const, text: "Full screen" }] : []),
                    ];
                    return (
                      <tr key={id} className="h-[72px] border-b border-gray-200 last:border-b-0 hover:bg-gray-25">
                        <td className="w-12 pl-6"><Check1 on={sel.has(id)} label={`Select ${r.c.title}`} onClick={() => toggle(id)} /></td>
                        <td className="px-6">
                          <button type="button" onClick={() => open(id)} className="flex cursor-pointer items-center gap-3 text-left">
                            <img src={r.avatar} alt="" className="size-10 rounded-full object-cover ring-1 ring-black/10" />
                            <span><span className="block text-sm font-medium text-gray-900">{r.c.title || "Untitled reel"}</span>
                              <span className="block text-sm text-gray-500">{r.messages} {r.messages === 1 ? "message" : "messages"}</span></span>
                          </button>
                        </td>
                        <td className="w-[300px] px-6">
                          <div className="flex items-center gap-3">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${Math.round(r.seconds)} seconds`}>
                              <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(3, (r.seconds / maxLen) * 100)}%` }} />
                            </div>
                            <span className="w-14 text-right text-sm font-medium text-gray-700 tabular-nums">{fmtLen(r.seconds)}</span>
                          </div>
                        </td>
                        <td className="w-24 px-6">{r.seconds > 60 && <Tag tone="amber">Over 60s</Tag>}</td>
                        <td className="px-6 text-sm whitespace-nowrap text-gray-600">{fmtDate(r.c.updatedAt)}</td>
                        <td className="px-6"><div className="flex flex-wrap gap-1">
                          {tags.slice(0, 3).map((t) => <Tag key={t.text} tone={t.tone} dot={t.dot}>{t.text}</Tag>)}
                          {tags.length > 3 && <Tag tone="gray">+{tags.length - 3}</Tag>}
                        </div></td>
                        <td className="w-24 pr-6"><div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Delete ${r.c.title}`} onClick={() => del([id])} className="flex size-9 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-700"><Trash2 size={18} /></button>
                          <button type="button" aria-label={`Edit ${r.c.title}`} onClick={() => open(id)} className="flex size-9 cursor-pointer items-center justify-center rounded-md text-gray-500 hover:bg-gray-50 hover:text-gray-700"><Pencil size={18} /></button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-gray-200 px-6 py-3.5">
              <span className="text-sm font-medium text-gray-700">Page {Math.min(page + 1, pages)} of {pages}</span>
              <div className="flex gap-3">
                <button type="button" className={`${btn} disabled:cursor-default disabled:opacity-50`} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className={`${btn} disabled:cursor-default disabled:opacity-50`} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
