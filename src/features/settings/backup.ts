import { db, SYNCED_TABLES, type Attachment } from "@/lib/db";
import { blobToDataUrl, dataUrlToBlob, downloadJson } from "@/lib/utils";
import { labelFor } from "@/lib/repo";
import { requestFlush } from "@/lib/sync";

export interface BackupFile {
  app: "passport";
  version: 1;
  exportedAt: number;
  includesAttachments: boolean;
  tables: Record<string, unknown[]>;
  lock?: unknown; // salt + verifier so encrypted fields remain decryptable with the same PIN
}

/** Export everything. Encrypted fields stay encrypted — you need the same PIN to read them after restore. */
export async function exportBackup(includeAttachments: boolean) {
  const tables: Record<string, unknown[]> = {};
  for (const t of SYNCED_TABLES) {
    if (t === "attachments") {
      if (!includeAttachments) continue;
      const atts = await db.attachments.toArray();
      tables[t] = await Promise.all(atts.map(async (a) => ({ ...a, blob: undefined, dataUrl: a.blob ? await blobToDataUrl(a.blob) : undefined })));
    } else tables[t] = await db.table(t).toArray();
  }
  const lock = (await db.settings.get("lock"))?.value;
  const file: BackupFile = { app: "passport", version: 1, exportedAt: Date.now(), includesAttachments: includeAttachments, tables, lock };
  downloadJson(`passport-backup-${new Date().toISOString().slice(0, 10)}.json`, file);
}

export async function importBackup(file: File, mode: "merge" | "replace") {
  const parsed = JSON.parse(await file.text()) as BackupFile;
  if (parsed.app !== "passport") throw new Error("Not a Passport backup file");
  await db.transaction("rw", [...SYNCED_TABLES.map((t) => db.table(t)), db.settings, db.syncQueue, db.syncLog], async () => {
    if (mode === "replace") {
      for (const t of SYNCED_TABLES) await db.table(t).clear();
      await db.syncLog.clear();
    }
    for (const t of SYNCED_TABLES) {
      const rows = parsed.tables[t] ?? [];
      if (t === "attachments") {
        for (const r of rows as (Attachment & { dataUrl?: string })[]) {
          const { dataUrl, ...rest } = r;
          await db.attachments.put({ ...rest, blob: dataUrl ? await dataUrlToBlob(dataUrl) : undefined });
        }
      } else await db.table(t).bulkPut(rows);
      for (const r of rows as { id: string }[]) await db.syncQueue.add({ table: t, docId: r.id, op: "put", at: Date.now(), label: labelFor(t, r as unknown as Record<string, unknown>) });
    }
    if (parsed.lock && mode === "replace") await db.settings.put({ key: "lock", value: parsed.lock });
  });
  requestFlush();
}

export async function wipeAllData() {
  await db.delete();
  localStorage.clear();
  location.reload();
}
