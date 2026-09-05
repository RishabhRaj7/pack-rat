import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting } from "./db";
import { fetchRates, type RateTable } from "./services";

const guessHomeCurrency = () => {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const map: Record<string, string> = { IN: "INR", US: "USD", GB: "GBP", SG: "SGD", AE: "AED", AU: "AUD", CA: "CAD", JP: "JPY", DE: "EUR", FR: "EUR", NL: "EUR", ES: "EUR", IT: "EUR", IE: "EUR" };
    return (region && map[region]) || "USD";
  } catch {
    return "USD";
  }
};

/** Home currency, reactive across the whole app (stored in settings, synced with Dexie live query). */
export function useHomeCurrency() {
  const row = useLiveQuery(() => db.settings.get("homeCurrency"), []);
  const cur = (row?.value as string | undefined) ?? guessHomeCurrency();
  const set = async (c: string) => setSetting("homeCurrency", c.toUpperCase());
  return [cur, set] as const;
}

/** Live FX table for a base currency; auto-refreshes every 30 min while mounted. */
export function useRates(base?: string) {
  const [table, setTable] = useState<RateTable | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async (force = false) => {
    if (!base) return;
    setLoading(true);
    setTable(await fetchRates(base, force));
    setLoading(false);
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);
  return { table, loading, refresh: () => load(true) };
}

/** Whether the Trains section / tab is shown at all (device preference, defaults to on). */
export function useTrainsEnabled() {
  const row = useLiveQuery(() => db.settings.get("trainsEnabled"), []);
  const enabled = row ? row.value !== false : true;
  const set = async (v: boolean) => setSetting("trainsEnabled", v);
  return [enabled, set] as const;
}

/**
 * "Viewing as" filter: which family members' trips / journeys / documents to show.
 * Empty array = everyone. Stored per device so each person can keep their own focus.
 */
export function useFocusMembers() {
  const row = useLiveQuery(() => db.settings.get("focusMembers"), []);
  const ids = (row?.value as string[] | undefined) ?? [];
  const set = async (next: string[]) => setSetting("focusMembers", next);
  return [ids, set] as const;
}

/** True when the record concerns any of the focused members (or when no focus is set). */
export const matchesFocus = (focus: string[], memberIds: string[] | undefined) => focus.length === 0 || (memberIds ?? []).some((id) => focus.includes(id));

export async function getRecentPairs(): Promise<[string, string][]> {
  return getSetting<[string, string][]>("fx:recentPairs", []);
}
export async function pushRecentPair(from: string, to: string) {
  const cur = await getRecentPairs();
  const next = [[from, to] as [string, string], ...cur.filter(([a, b]) => !(a === from && b === to))].slice(0, 6);
  await setSetting("fx:recentPairs", next);
}
