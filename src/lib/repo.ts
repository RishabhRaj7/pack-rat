/**
 * Repository layer: all writes go through here so that
 *  1) timestamps are consistent (last-write-wins sync),
 *  2) every change is enqueued for Firestore sync when available.
 * Reads happen via Dexie live queries in feature hooks.
 */
import { db, TABLE_LABELS, type Attachment, type SyncedTable } from "./db";
import { requestFlush } from "./sync";

/** Best-effort human readable label for a record, used by the sync status UI. */
export function labelFor(table: SyncedTable, rec?: Record<string, unknown> | null): string {
  const base = TABLE_LABELS[table];
  if (!rec) return base;
  const pick = (...keys: string[]) => keys.map((k) => rec[k]).find((v) => typeof v === "string" && v.trim()) as string | undefined;
  switch (table) {
    case "members": return `${base} · ${pick("name") ?? "unnamed"}`;
    case "documents": return `${pick("type") ? cap(String(rec.type)) : base}${pick("label", "holderName") ? ` · ${pick("label", "holderName")}` : ""}`;
    case "trips": return `Trip · ${pick("title", "city") ?? "untitled"}`;
    case "places": return `Place · ${pick("name") ?? "unnamed"}`;
    case "hotels": return `Hotel · ${pick("name") ?? "unnamed"}`;
    case "flights": return `Flight · ${pick("flightNumber", "airline") ?? "unnamed"}`;
    case "itineraryDays": return `Day · ${pick("date") ?? ""}`.trim();
    case "expenses": return `Expense · ${pick("note", "category", "title") ?? ""}`.replace(/ · $/, "");
    case "loyalty": return `Loyalty · ${pick("program", "name") ?? "card"}`;
    case "attachments": return `File · ${pick("name") ?? "attachment"}`;
    default: return base;
  }
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

type WithMeta = { id: string; createdAt?: number; updatedAt?: number };

export async function put<T extends WithMeta>(table: SyncedTable, item: T): Promise<T & { createdAt: number; updatedAt: number }> {
  const now = Date.now();
  const rec = { ...item, createdAt: item.createdAt ?? now, updatedAt: now };
  await db.table(table).put(rec);
  // Collapse older queued ops for the same record so the queue reflects the latest state only.
  await db.syncQueue.where("docId").equals(rec.id).filter((q) => q.table === table).delete();
  await db.syncQueue.add({ table, docId: rec.id, op: "put", at: now, label: labelFor(table, rec as unknown as Record<string, unknown>) });
  requestFlush();
  return rec;
}

export async function remove(table: SyncedTable, id: string) {
  const existing = (await db.table(table).get(id)) as Record<string, unknown> | undefined;
  await db.table(table).delete(id);
  await db.syncQueue.where("docId").equals(id).filter((q) => q.table === table).delete();
  await db.syncQueue.add({ table, docId: id, op: "delete", at: Date.now(), label: labelFor(table, existing) });
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
