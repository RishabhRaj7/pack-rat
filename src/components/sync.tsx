import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Cloud, CloudOff, CloudUpload, CloudDownload, RefreshCw, Clock, AlertTriangle, Check, KeyRound, HardDrive, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { TABLE_LABELS, type SyncedTable } from "@/lib/db";
import { flushQueue, useRecordSync, useSyncStatus, type RecordSyncStatus, type SyncState } from "@/lib/sync";
import { Button, Modal } from "./ui";

/* ---------------- helpers ---------------- */

export function timeAgo(ts: number | null | undefined) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
}

/** Re-render every N seconds so "x ago" labels stay fresh. */
function useTick(ms = 15000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

const STATUS_META: Record<RecordSyncStatus, { label: string; icon: typeof Cloud; cls: string; hint: string }> = {
  synced: { label: "Synced", icon: Cloud, cls: "bg-ok-soft text-ok", hint: "Saved in the cloud and available on your other devices" },
  pending: { label: "Not synced yet", icon: Clock, cls: "bg-warn-soft text-warn", hint: "Waiting to upload (offline or queued)" },
  syncing: { label: "Syncing…", icon: RefreshCw, cls: "bg-accent-soft text-accent-strong [&>svg]:animate-spin", hint: "Uploading right now" },
  error: { label: "Sync failed", icon: AlertTriangle, cls: "bg-danger-soft text-danger", hint: "Last upload failed — will retry" },
  local: { label: "This device only", icon: HardDrive, cls: "bg-surface-2 text-muted", hint: "Sign in under Settings → Cloud sync to back this up" },
  unknown: { label: "", icon: Cloud, cls: "", hint: "" },
};

/* ---------------- Per-record badge ---------------- */

/** Small pill shown on cards: Synced / Not synced yet / Syncing… / This device only. */
export function SyncBadge({ table, id, className, compact = false }: { table: SyncedTable; id?: string; className?: string; compact?: boolean }) {
  const r = useRecordSync(table, id);
  useTick();
  if (r.status === "unknown") return null;
  const m = STATUS_META[r.status];
  const title = r.error ? `${m.hint}: ${r.error}` : r.at && r.status === "synced" ? `${m.hint} · ${timeAgo(r.at)}` : m.hint;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none", m.cls, className)} title={title} aria-label={`${m.label}${r.at ? ` ${timeAgo(r.at)}` : ""}`}>
      <m.icon size={10} />
      {!compact && (
        <span>
          {m.label}
          {r.status === "synced" && r.at ? <span className="font-normal opacity-80"> · {timeAgo(r.at)}</span> : null}
        </span>
      )}
    </span>
  );
}

/* ---------------- Nav indicator + panel ---------------- */

export function describeSync(s: SyncState): { label: string; detail: string | null; icon: typeof Cloud; tone: "muted" | "accent" | "warn" | "danger" | "ok" } {
  if (!s.configured) return { label: "Local", detail: "Cloud sync not configured — data stays on this device", icon: HardDrive, tone: "muted" };
  if (!s.online) return { label: "Offline", detail: s.pending ? `${s.pending} change${s.pending === 1 ? "" : "s"} waiting for a connection` : "Changes will sync when you're back online", icon: CloudOff, tone: "warn" };
  if (!s.user) return { label: "Not signed in", detail: s.pending ? `${s.pending} local change${s.pending === 1 ? "" : "s"} not backed up` : "Sign in to sync across devices", icon: CloudOff, tone: "warn" };
  if (s.syncing && s.current) {
    const p = s.progress ? ` ${Math.min(s.progress.done + 1, s.progress.total)}/${s.progress.total}` : "";
    return { label: `Syncing${p}`, detail: `${s.current.op === "delete" ? "Removing" : "Uploading"} ${s.current.label}`, icon: CloudUpload, tone: "accent" };
  }
  if (s.pulling.length) return { label: "Receiving…", detail: `Downloading ${s.pulling.map((t) => TABLE_LABELS[t].toLowerCase() + "s").join(", ")}`, icon: CloudDownload, tone: "accent" };
  if (s.error && s.pending) return { label: "Sync failed", detail: s.error, icon: AlertTriangle, tone: "danger" };
  if (s.pending) return { label: `${s.pending} pending`, detail: `${s.pending} change${s.pending === 1 ? "" : "s"} waiting to upload`, icon: Clock, tone: "warn" };
  return { label: "Synced", detail: s.lastSyncedAt ? `Everything is up to date · ${timeAgo(s.lastSyncedAt)}` : "Everything is up to date", icon: Cloud, tone: "ok" };
}

const TONE: Record<string, string> = { muted: "text-muted", accent: "text-accent", warn: "text-warn", danger: "text-danger", ok: "text-ok" };

/** Clickable status shown in the sidebar / top bar. Says exactly what is syncing right now. */
export function SyncIndicator({ expanded = false, className }: { expanded?: boolean; className?: string }) {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  useTick(5000);
  const d = describeSync(s);
  const busy = s.syncing || s.pulling.length > 0;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("flex min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold transition hover:bg-surface-2", TONE[d.tone], busy && "[&>svg]:animate-pulse", className)} title={d.detail ?? d.label} aria-label={`Sync status: ${d.label}. ${d.detail ?? ""}`}>
        {busy ? <RefreshCw size={13} className="animate-spin" /> : <d.icon size={13} />}
        <span className={cn("min-w-0", !expanded && "hidden lg:block")}>
          <span className="block truncate">{d.label}</span>
          {expanded && d.detail && <span className="block truncate text-[10px] font-normal text-muted">{d.detail}</span>}
        </span>
        {s.pending > 0 && s.configured && !s.syncing && <span className="rounded-full bg-warn-soft px-1.5 text-warn">{s.pending}</span>}
      </button>
      <SyncPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function OpRow({ icon, title, sub, right, tone }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-2", tone)}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

/** Full breakdown: current upload, outbox, incoming, recent activity, vault-key state. */
export function SyncPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSyncStatus();
  const d = describeSync(s);
  useTick(5000);
  const failing = s.queue.filter((q) => q.error);
  return (
    <Modal open={open} onClose={onClose} title="Sync status" size="md">
      <div className="-mx-5 -my-4 divide-y divide-line">
        <div className={cn("flex items-center gap-3 px-4 py-3", TONE[d.tone])}>
          {s.syncing || s.pulling.length ? <RefreshCw size={18} className="animate-spin" /> : <d.icon size={18} />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{d.label}</p>
            {d.detail && <p className="truncate text-xs text-muted">{d.detail}</p>}
          </div>
          {s.configured && s.user && s.online && !s.syncing && s.pending > 0 && <Button size="sm" variant="secondary" onClick={() => void flushQueue()}>Retry now</Button>}
        </div>

        {s.configured && s.user && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-xs text-muted">
            <span className="truncate">Signed in as <b className="text-fg">{s.user.email ?? s.user.name}</b></span>
            <span className="shrink-0">{s.lastSyncedAt ? `Last sync ${timeAgo(s.lastSyncedAt)}` : "No sync yet"}</span>
          </div>
        )}

        {s.user && (
          <div className="flex items-start gap-2 px-4 py-3 text-xs text-muted">
            <KeyRound size={14} className="mt-0.5 shrink-0 text-accent" />
            <p><b className="text-fg">One PIN, every device.</b> ID, card and policy numbers are encrypted with a key derived from your PIN alone — enter the same PIN on each device and everything decrypts. Nothing to merge.</p>
          </div>
        )}

        {s.current && (
          <section>
            <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted">Syncing now</p>
            <OpRow icon={<RefreshCw size={14} className="animate-spin text-accent" />} title={s.current.label} sub={`${s.current.op === "delete" ? "Removing from cloud" : "Uploading"} · ${TABLE_LABELS[s.current.table]}`} right={s.progress && <span className="text-xs font-semibold text-muted">{Math.min(s.progress.done + 1, s.progress.total)}/{s.progress.total}</span>} />
          </section>
        )}

        {s.pulling.length > 0 && (
          <section>
            <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted">Receiving</p>
            {s.pulling.map((t) => <OpRow key={t} icon={<CloudDownload size={14} className="text-accent" />} title={`${TABLE_LABELS[t]}s`} sub="Downloading changes from your other devices" />)}
          </section>
        )}

        <section>
          <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted">Waiting to upload · {s.queue.length}</p>
          {s.queue.length === 0 && <p className="px-4 py-3 text-sm text-muted">Nothing pending — all local changes are in the cloud.</p>}
          {s.queue.slice(0, 30).map((q) => {
            const active = s.current?.docId === q.docId && s.current?.table === q.table;
            return <OpRow key={q.id} icon={active ? <RefreshCw size={14} className="animate-spin text-accent" /> : q.error ? <AlertTriangle size={14} className="text-danger" /> : <Clock size={14} className="text-warn" />} title={q.label ?? TABLE_LABELS[q.table]} sub={q.error ? `Failed: ${q.error}` : `${q.op === "delete" ? "Delete" : "Save"} · queued ${timeAgo(q.at)}${!s.user ? " · sign in to upload" : !s.online ? " · offline" : ""}`} />;
          })}
          {s.queue.length > 30 && <p className="px-4 pb-2 text-xs text-muted">…and {s.queue.length - 30} more</p>}
        </section>

        {s.recent.length > 0 && (
          <section>
            <p className="px-4 pt-3 text-[10px] font-bold uppercase tracking-wide text-muted">Recently synced</p>
            {s.recent.map((r) => <OpRow key={r.docKey + r.at} icon={r.direction === "push" ? <CloudUpload size={14} className="text-ok" /> : <CloudDownload size={14} className="text-ok" />} title={r.label ?? TABLE_LABELS[r.table]} sub={`${r.direction === "push" ? "Uploaded" : "Received"}${r.op === "delete" ? " (deleted)" : ""} · ${timeAgo(r.at)}`} right={<Check size={14} className="text-ok" />} />)}
          </section>
        )}

        {failing.length > 0 && <p className="px-4 py-2 text-xs text-danger">{failing.length} item{failing.length > 1 ? "s" : ""} failed to upload. They stay in the outbox and are retried automatically.</p>}
        <div className="flex items-center justify-between px-4 py-3 text-xs">
          <Link to="/settings" onClick={onClose} className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">Sync settings <ChevronRight size={12} /></Link>
          <span className="text-muted">{s.online ? "Online" : "Offline"}</span>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Vault key ---------------- */

/**
 * Kept for layout compatibility. The vault key is now derived from the PIN alone, so there is
 * nothing to merge between devices — the same PIN unlocks the same data everywhere.
 */
export function VaultKeyBanner() {
  return null;
}

/* ---------------- Mouse-friendly horizontal strip ---------------- */

/**
 * Horizontal tab/chip strip that works with a mouse as well as touch:
 *  - vertical wheel scrolls horizontally (Windows Chrome has no swipe and hides the thin scrollbar),
 *  - the active item is scrolled into view,
 *  - arrow buttons appear on pointer devices when content overflows.
 */
export function ScrollStrip({ children, className, activeKey }: { children: ReactNode; className?: string; activeKey?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const measure = () => {
    const el = ref.current;
    if (!el) return;
    setOverflow({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);
  useEffect(() => {
    if (!activeKey || !ref.current) return;
    const active = ref.current.querySelector<HTMLElement>(`[data-strip-key="${CSS.escape(activeKey)}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [activeKey]);
  const scrollBy = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: "smooth" });
  return (
    <div className={cn("relative min-w-0", className)}>
      {overflow.left && <button type="button" aria-label="Scroll left" onClick={() => scrollBy(-240)} className="absolute left-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-card md:flex"><ChevronRight size={14} className="rotate-180" /></button>}
      <div
        ref={ref}
        className="flex gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY;
        }}
      >
        {children}
      </div>
      {overflow.right && <button type="button" aria-label="Scroll right" onClick={() => scrollBy(240)} className="absolute right-0 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface shadow-card md:flex"><ChevronRight size={14} /></button>}
    </div>
  );
}
