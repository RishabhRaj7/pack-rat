/**
 * Two-way sync between IndexedDB (source of truth for the UI) and Firestore.
 *  - Local writes are queued (repo.put/remove) and flushed when online + signed in.
 *  - Remote changes stream in via onSnapshot and are applied with last-write-wins on `updatedAt`.
 *  - Deletes are tombstones ({ deleted: true }) so they propagate across devices.
 *  - Attachment blobs are uploaded to Storage; only metadata + download URL go to Firestore.
 */
import { useSyncExternalStore } from "react";
import { db, SYNCED_TABLES, type SyncedTable, type Attachment } from "./db";
import { getFirebase, isFirebaseConfigured, watchAuth, type User } from "./firebase";

export interface SyncState {
  configured: boolean;
  user: { uid: string; email: string | null; name: string | null; photo: string | null } | null;
  online: boolean;
  pending: number;
  syncing: boolean;
  lastSyncedAt: number | null;
  error: string | null;
}

let state: SyncState = {
  configured: isFirebaseConfigured,
  user: null,
  online: navigator.onLine,
  pending: 0,
  syncing: false,
  lastSyncedAt: null,
  error: null,
};
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
export function useSyncStatus() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}

let flushTimer: number | undefined;
export function requestFlush() {
  db.syncQueue.count().then((n) => setState({ pending: n }));
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
    const items = await db.syncQueue.orderBy("id").toArray();
    for (const item of items) {
      const path = doc(fb.firestore, "users", state.user.uid, item.table, item.docId);
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
    }
    setState({ lastSyncedAt: Date.now(), pending: 0 });
  } catch (e) {
    setState({ error: (e as Error).message });
  } finally {
    flushing = false;
    setState({ syncing: false, pending: await db.syncQueue.count() });
  }
}

const unsubscribers: (() => void)[] = [];

async function startRemoteListeners(uid: string) {
  const fb = getFirebase();
  if (!fb) return;
  const { collection, onSnapshot } = await import("firebase/firestore");
  for (const table of SYNCED_TABLES) {
    const unsub = onSnapshot(collection(fb.firestore, "users", uid, table), async (snap) => {
      for (const change of snap.docChanges()) {
        const remote = change.doc.data() as Record<string, unknown> & { id: string; updatedAt: number; deleted?: boolean };
        const local = (await db.table(table).get(remote.id)) as { updatedAt?: number } | undefined;
        if (local && (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0)) continue;
        if (remote.deleted) {
          if (local) await db.table(table).delete(remote.id);
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
      }
      setState({ lastSyncedAt: Date.now() });
    });
    unsubscribers.push(unsub);
  }
}

function stopRemoteListeners() {
  unsubscribers.splice(0).forEach((u) => u());
}

let started = false;
export function initSync() {
  if (started) return;
  started = true;
  window.addEventListener("online", () => {
    setState({ online: true });
    requestFlush();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  db.syncQueue.count().then((n) => setState({ pending: n }));

  if (!isFirebaseConfigured) return;
  watchAuth((u: User | null) => {
    stopRemoteListeners();
    if (u) {
      setState({ user: { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL } });
      void startRemoteListeners(u.uid);
      requestFlush();
    } else setState({ user: null });
  });
}
