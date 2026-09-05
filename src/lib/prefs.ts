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

export async function getRecentPairs(): Promise<[string, string][]> {
  return getSetting<[string, string][]>("fx:recentPairs", []);
}
export async function pushRecentPair(from: string, to: string) {
  const cur = await getRecentPairs();
  const next = [[from, to] as [string, string], ...cur.filter(([a, b]) => !(a === from && b === to))].slice(0, 6);
  await setSetting("fx:recentPairs", next);
}
