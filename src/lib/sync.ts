/**
 * Two-way sync between IndexedDB (source of truth for the UI) and Firestore.
 *  - Local writes are queued (repo.put/remove) and flushed when online + signed in.
 *  - Remote changes stream in via onSnapshot and are applied with last-write-wins on `updatedAt`.
 *  - Deletes are tombstones ({ deleted: true }) so they propagate across devices.
 *  - Attachment blobs are uploaded to Storage; only metadata + download URL go to Firestore.
 *  - The vault *key config* (PBKDF2 salt + verifier — never the PIN) is shared at
 *    users/{uid}/meta/vault so every device derives the same AES key from the same PIN.
 *    Without this, ID numbers encrypted on one device are unreadable on another.
 *  - Every push / pull is recorded in `syncLog` and mirrored in the store below so the UI
 *    can show exactly what is synced, pending, or in flight.
 */
import { useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, SYNCED_TABLES, TABLE_LABELS, syncKey, type SyncedTable, type Attachment, type SyncQueueItem, type SyncLogRow } from "./db";
import { getFirebase, isFirebaseConfigured, watchAuth, type User } from "./firebase";
import { getLockConfig, sameVaultKey, vaultKeyOf, type VaultKeyConfig } from "./crypto";

export interface SyncActivity {
  table: SyncedTable;
  docId: string;
  op: "put" | "delete";
  label: string;
  startedAt: number;
}

export interface PullActivity {
  table: SyncedTable;
  count: number;
  at: number;
}

export type VaultKeyStatus =
  | "unknown" // not signed in / not checked yet
  | "none" // nothing in the cloud yet (this device will publish its own)
  | "match" // this device uses the shared key
  | "mismatch"; // cloud uses a different salt → ID numbers from other devices won't decrypt

export interface SyncState {
  configured: boolean;
  user: { uid: string; email: string | null; name: string | null; photo: string | null } | null;
  online: boolean;
  pending: number;
  syncing: boolean;
  /** Item currently being uploaded. */
  current: SyncActivity | null;
  /** Progress of the current flush. */
  progress: { done: number; total: number } | null;
  /** Snapshot of the outbox (oldest first). */
  queue: SyncQueueItem[];
  /** Last few things confirmed in the cloud (push or pull), newest first. */
  recent: SyncLogRow[];
  /** Tables currently receiving remote changes. */
  pulling: SyncedTable[];
  lastPull: PullActivity | null;
  lastSyncedAt: number | null;
  error: string | null;
  vaultKey: { status: VaultKeyStatus; remote: VaultKeyConfig | null; checkedAt: number | null };
}

const isBrowser = typeof window !== "undefined";

let state: SyncState = {
  configured: isFirebaseConfigured,
  user: null,
  online: isBrowser ? navigator.onLine : true,
  pending: 0,
  syncing: false,
  current: null,
  progress: null,
  queue: [],
  recent: [],
  pulling: [],
  lastPull: null,
  lastSyncedAt: null,
  error: null,
  vaultKey: { status: "unknown", remote: null, checkedAt: null },
};
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function getSyncState() {
  return state;
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state
  );
}

/* ---------------- Queue / log bookkeeping ---------------- */

async function refreshQueue() {
  const queue = await db.syncQueue.orderBy("id").toArray();
  setState({ queue, pending: queue.length });
  return queue;
}

async function refreshRecent() {
  const recent = await db.syncLog.orderBy("at").reverse().limit(12).toArray();
  setState({ recent });
}

async function logSynced(row: Omit<SyncLogRow, "docKey">) {
  await db.syncLog.put({ ...row, docKey: syncKey(row.table, row.docId) });
}

let flushTimer: number | undefined;
export function requestFlush() {
  void refreshQueue();
  if (!state.user || !state.online) return;
  window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => void flushQueue(), 800);
}

let flushing = false;
export async function flushQueue() {
  const fb = getFirebase();
  if (!fb || !state.user || flushing) return;
  const { doc, setDoc } = await import("firebase/firestore");
  const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
  flushing = true;
  setState({ syncing: true, error: null });
  try {
    const items = await refreshQueue();
    let done = 0;
    setState({ progress: { done, total: items.length } });
    for (const item of items) {
      const label = item.label ?? `${TABLE_LABELS[item.table]}`;
      setState({ current: { table: item.table, docId: item.docId, op: item.op, label, startedAt: Date.now() } });
      const path = doc(fb.firestore, "users", state.user.uid, item.table, item.docId);
      try {
        if (item.op === "delete") {
          await setDoc(path, { id: item.docId, deleted: true, updatedAt: Date.now() });
        } else {
          const rec = (await db.table(item.table).get(item.docId)) as Record<string, unknown> | undefined;
          if (rec) {
            const payload: Record<string, unknown> = { ...rec };
            if (item.table === "attachments") {
              const att = rec as unknown as Attachment;
              if (att.blob && !att.remoteUrl) {
                const r = ref(fb.storage, `users/${state.user.uid}/attachments/${att.id}`);
                await uploadBytes(r, att.blob, { contentType: att.mime });
                const url = await getDownloadURL(r);
                await db.attachments.update(att.id, { remoteUrl: url });
                payload.remoteUrl = url;
              }
              delete payload.blob;
            }
            Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
            await setDoc(path, payload, { merge: false });
          }
        }
        await db.syncQueue.delete(item.id!);
        await logSynced({ table: item.table, docId: item.docId, op: item.op, direction: "push", label, at: Date.now() });
      } catch (e) {
        // Keep the item in the outbox with the error so the UI can show it; continue with the rest.
        await db.syncQueue.update(item.id!, { attempts: (item.attempts ?? 0) + 1, error: (e as Error).message });
        setState({ error: `${label}: ${(e as Error).message}` });
      }
      done++;
      setState({ progress: { done, total: items.length } });
      await refreshQueue();
    }
    setState({ lastSyncedAt: Date.now() });
    await refreshRecent();
  } catch (e) {
    setState({ error: (e as Error).message });
  } finally {
    flushing = false;
    setState({ syncing: false, current: null, progress: null });
    await refreshQueue();
  }
}

/* ---------------- Remote → local ---------------- */

const unsubscribers: (() => void)[] = [];

function labelFromRemote(table: SyncedTable, r: Record<string, unknown>) {
  const s = (k: string) => (typeof r[k] === "string" && (r[k] as string).trim() ? (r[k] as string) : undefined);
  const name = s("name") ?? s("title") ?? s("label") ?? s("program") ?? s("flightNumber") ?? s("type") ?? s("date") ?? s("note");
  return name ? `${TABLE_LABELS[table]} · ${name}` : TABLE_LABELS[table];
}

async function startRemoteListeners(uid: string) {
  const fb = getFirebase();
  if (!fb) return;
  const { collection, onSnapshot } = await import("firebase/firestore");
  for (const table of SYNCED_TABLES) {
    const unsub = onSnapshot(
      collection(fb.firestore, "users", uid, table),
      async (snap) => {
        const changes = snap.docChanges();
        if (!changes.length) return;
        setState({ pulling: [...new Set([...state.pulling, table])] });
        let applied = 0;
        try {
          for (const change of changes) {
            const remote = change.doc.data() as Record<string, unknown> & { id: string; updatedAt: number; deleted?: boolean };
            if (!remote.id) continue;
            const local = (await db.table(table).get(remote.id)) as { updatedAt?: number } | undefined;
            if (local && (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0)) {
              // Already have this version (probably our own push) — make sure it's marked synced.
              if (!(await db.syncLog.get(syncKey(table, remote.id)))) await logSynced({ table, docId: remote.id, op: "put", direction: "pull", label: labelFromRemote(table, remote), at: Date.now() });
              continue;
            }
            if (remote.deleted) {
              if (local) await db.table(table).delete(remote.id);
              await logSynced({ table, docId: remote.id, op: "delete", direction: "pull", label: labelFromRemote(table, remote), at: Date.now() });
              applied++;
              continue;
            }
            if (table === "attachments") {
              // fetch blob lazily so it is available offline
              const att = remote as unknown as Attachment;
              if (att.remoteUrl && !(local as Attachment | undefined)?.blob) {
                try {
                  const blob = await (await fetch(att.remoteUrl)).blob();
                  att.blob = blob;
                } catch {
                  /* offline; will retry on next snapshot */
                }
              } else if ((local as Attachment | undefined)?.blob) att.blob = (local as Attachment).blob;
            }
            await db.table(table as SyncedTable).put(remote);
            await logSynced({ table, docId: remote.id, op: "put", direction: "pull", label: labelFromRemote(table, remote), at: Date.now() });
            applied++;
          }
        } finally {
          setState({ pulling: state.pulling.filter((t) => t !== table), lastSyncedAt: Date.now(), lastPull: applied ? { table, count: applied, at: Date.now() } : state.lastPull });
          if (applied) await refreshRecent();
        }
      },
      (err) => setState({ error: `${TABLE_LABELS[table]}: ${err.message}` })
    );
    unsubscribers.push(unsub);
  }
  unsubscribers.push(await watchRemoteVaultKey(uid));
}

function stopRemoteListeners() {
  unsubscribers.splice(0).forEach((u) => u());
}

/* ---------------- Vault key (salt + verifier) sharing ---------------- */

const VAULT_DOC = ["meta", "vault"] as const;

/** Publish this device's key config so other devices can derive the same key from the same PIN. */
export async function publishVaultKey(force = false) {
  const fb = getFirebase();
  const cfg = await getLockConfig();
  if (!fb || !state.user || !cfg) return;
  const { doc, setDoc, getDoc } = await import("firebase/firestore");
  const ref = doc(fb.firestore, "users", state.user.uid, ...VAULT_DOC);
  if (!force) {
    const existing = await getDoc(ref);
    if (existing.exists()) return; // never overwrite silently — the merge flow handles conflicts
  }
  const payload: VaultKeyConfig = { ...vaultKeyOf(cfg), keyCreatedAt: cfg.keyCreatedAt ?? Date.now() };
  await setDoc(ref, { ...payload, updatedAt: Date.now() });
  setState({ vaultKey: { status: "match", remote: payload, checkedAt: Date.now() } });
}

/** One-off read (used by the first-run PIN screen when the browser is already signed in). */
export async function fetchRemoteVaultKey(): Promise<VaultKeyConfig | null> {
  const fb = getFirebase();
  if (!fb || !state.user) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const snap = await getDoc(doc(fb.firestore, "users", state.user.uid, ...VAULT_DOC));
  if (!snap.exists()) return null;
  const d = snap.data() as VaultKeyConfig;
  return { saltB64: d.saltB64, verifierB64: d.verifierB64, iterations: d.iterations, keyCreatedAt: d.keyCreatedAt ?? 0 };
}

export async function recheckVaultKey() {
  const local = await getLockConfig();
  const remote = state.vaultKey.remote;
  if (!state.user) return;
  if (!remote) {
    setState({ vaultKey: { status: "none", remote: null, checkedAt: Date.now() } });
    if (local) await publishVaultKey();
    return;
  }
  setState({ vaultKey: { status: local && sameVaultKey(local, remote) ? "match" : local ? "mismatch" : "unknown", remote, checkedAt: Date.now() } });
}

async function watchRemoteVaultKey(uid: string) {
  const fb = getFirebase();
  if (!fb) return () => {};
  const { doc, onSnapshot } = await import("firebase/firestore");
  return onSnapshot(doc(fb.firestore, "users", uid, ...VAULT_DOC), async (snap) => {
    if (!snap.exists()) {
      setState({ vaultKey: { status: "none", remote: null, checkedAt: Date.now() } });
      await publishVaultKey();
      return;
    }
    const d = snap.data() as VaultKeyConfig;
    const remote: VaultKeyConfig = { saltB64: d.saltB64, verifierB64: d.verifierB64, iterations: d.iterations, keyCreatedAt: d.keyCreatedAt ?? 0 };
    const local = await getLockConfig();
    setState({ vaultKey: { status: local && sameVaultKey(local, remote) ? "match" : local ? "mismatch" : "unknown", remote, checkedAt: Date.now() } });
  });
}

/* ---------------- Init ---------------- */

let started = false;
export function initSync() {
  if (started || !isBrowser) return;
  started = true;
  window.addEventListener("online", () => {
    setState({ online: true });
    requestFlush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  void refreshQueue();
  void refreshRecent();

  if (!isFirebaseConfigured) return;
  watchAuth((u: User | null) => {
    stopRemoteListeners();
    if (u) {
      setState({ user: { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL }, error: null });
      void startRemoteListeners(u.uid);
      requestFlush();
    } else setState({ user: null, vaultKey: { status: "unknown", remote: null, checkedAt: null }, pulling: [], current: null, progress: null });
  });
}

/* ---------------- Per-record status ---------------- */

export type RecordSyncStatus =
  | "local" // sync not configured / not signed in — lives only on this device
  | "pending" // queued, waiting for network / sign-in
  | "syncing" // being uploaded right now
  | "error" // last upload attempt failed (will retry)
  | "synced" // confirmed in the cloud
  | "unknown";

export interface RecordSync {
  status: RecordSyncStatus;
  at: number | null; // last confirmed sync time
  error?: string;
}

/** Live sync status for a single record — drives the badges shown across the app. */
export function useRecordSync(table: SyncedTable, id: string | undefined): RecordSync {
  const s = useSyncStatus();
  const queued = useLiveQuery(() => (id ? db.syncQueue.where("docId").equals(id).filter((q) => q.table === table).first() : undefined), [table, id]);
  const log = useLiveQuery(() => (id ? db.syncLog.get(syncKey(table, id)) : undefined), [table, id]);
  if (!id) return { status: "unknown", at: null };
  if (!s.configured || !s.user) return queued || !log ? { status: "local", at: log?.at ?? null } : { status: "local", at: log.at };
  if (queued) {
    if (s.current && s.current.docId === id && s.current.table === table) return { status: "syncing", at: log?.at ?? null };
    if (queued.error) return { status: "error", at: log?.at ?? null, error: queued.error };
    return { status: "pending", at: log?.at ?? null };
  }
  if (log) return { status: "synced", at: log.at };
  // Not queued and no log: written before sync logging existed or pulled before v2. Treat as synced.
  return { status: "synced", at: null };
}

/** Summary used by list pages: how many of these ids are still waiting. */
export function useUnsyncedCount(table: SyncedTable) {
  return useLiveQuery(() => db.syncQueue.where("table").equals(table).count(), [table]) ?? 0;
}
