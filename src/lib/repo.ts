/**
 * Repository layer: all writes go through here so that
 *  1) timestamps are consistent (last-write-wins sync),
 *  2) every change is enqueued for Firestore sync when available.
 * Reads happen via Dexie live queries in feature hooks.
 */
import { db, type Attachment, type SyncedTable } from "./db";
import { requestFlush } from "./sync";

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

type WithMeta = { id: string; createdAt?: number; updatedAt?: number };

export async function put<T extends WithMeta>(table: SyncedTable, item: T): Promise<T & { createdAt: number; updatedAt: number }> {
  const now = Date.now();
  const rec = { ...item, createdAt: item.createdAt ?? now, updatedAt: now };
  await db.table(table).put(rec);
  await db.syncQueue.add({ table, docId: rec.id, op: "put", at: now });
  requestFlush();
  return rec;
}

export async function remove(table: SyncedTable, id: string) {
  await db.table(table).delete(id);
  await db.syncQueue.add({ table, docId: id, op: "delete", at: Date.now() });
  requestFlush();
}

export async function saveAttachment(file: File | Blob, name?: string): Promise<Attachment> {
  const att: Attachment = {
    id: newId(),
    name: name ?? (file instanceof File ? file.name : "attachment"),
    mime: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return put("attachments", att);
}

export async function removeAttachment(id?: string) {
  if (id) await remove("attachments", id);
}

/** Cascade delete everything that belongs to a trip. */
export async function deleteTripCascade(tripId: string) {
  const [places, hotels, flights, days, expenses] = await Promise.all([
    db.places.where("tripId").equals(tripId).toArray(),
    db.hotels.where("tripId").equals(tripId).toArray(),
    db.flights.where("tripId").equals(tripId).toArray(),
    db.itineraryDays.where("tripId").equals(tripId).toArray(),
    db.expenses.where("tripId").equals(tripId).toArray(),
  ]);
  const attachmentIds = [...places, ...hotels, ...flights].flatMap((x) => x.attachmentIds ?? []);
  await Promise.all([
    ...places.map((p) => remove("places", p.id)),
    ...hotels.map((h) => remove("hotels", h.id)),
    ...flights.map((f) => remove("flights", f.id)),
    ...days.map((d) => remove("itineraryDays", d.id)),
    ...expenses.map((e) => remove("expenses", e.id)),
    ...attachmentIds.map((a) => remove("attachments", a)),
  ]);
  await remove("trips", tripId);
}

export async function deleteMemberCascade(memberId: string) {
  const docs = await db.documents.where("memberId").equals(memberId).toArray();
  const member = await db.members.get(memberId);
  await Promise.all(docs.map((d) => Promise.all([remove("documents", d.id), removeAttachment(d.attachmentId)])));
  await removeAttachment(member?.photoId);
  await remove("members", memberId);
}
