import Dexie, { type Table } from "dexie";
import type { FamilyMember } from "@/features/family/types";
import type { IdDocument } from "@/features/documents/types";
import type { Trip, Place, Hotel, Flight, ItineraryDay, Expense } from "@/features/trips/types";
import type { LoyaltyCard } from "@/features/loyalty/types";

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  blob?: Blob; // local copy (IndexedDB)
  remoteUrl?: string; // Firebase Storage download URL once uploaded
  createdAt: number;
  updatedAt: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SyncQueueItem {
  id?: number;
  table: SyncedTable;
  docId: string;
  op: "put" | "delete";
  at: number;
}

export const SYNCED_TABLES = [
  "members",
  "documents",
  "trips",
  "places",
  "hotels",
  "flights",
  "itineraryDays",
  "expenses",
  "loyalty",
  "attachments",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export class PassportDB extends Dexie {
  members!: Table<FamilyMember, string>;
  documents!: Table<IdDocument, string>;
  trips!: Table<Trip, string>;
  places!: Table<Place, string>;
  hotels!: Table<Hotel, string>;
  flights!: Table<Flight, string>;
  itineraryDays!: Table<ItineraryDay, string>;
  expenses!: Table<Expense, string>;
  loyalty!: Table<LoyaltyCard, string>;
  attachments!: Table<Attachment, string>;
  settings!: Table<SettingRow, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("passport");
    this.version(1).stores({
      members: "id, name, updatedAt",
      documents: "id, memberId, type, expiryDate, updatedAt",
      trips: "id, countryCode, startDate, endDate, updatedAt",
      places: "id, tripId, updatedAt",
      hotels: "id, tripId, updatedAt",
      flights: "id, tripId, departAt, updatedAt",
      itineraryDays: "id, tripId, date, updatedAt",
      expenses: "id, tripId, date, updatedAt",
      loyalty: "id, memberId, kind, updatedAt",
      attachments: "id, updatedAt",
      settings: "key",
      syncQueue: "++id, table, docId",
    });
  }
}

export const db = new PassportDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row ? (row.value as T) : fallback;
}
export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
