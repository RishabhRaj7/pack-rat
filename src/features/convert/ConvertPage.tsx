import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDownUp, RefreshCw, Star, WifiOff } from "lucide-react";
import { Card, Select, PageHeader, Chip } from "@/components/ui";
import { convertWith, POPULAR_CURRENCIES, currencyName, currencySymbol } from "@/lib/services";
import { useHomeCurrency, useRates, getRecentPairs, pushRecentPair } from "@/lib/prefs";
import { useTrips } from "@/features/trips/hooks";
import { tripStatus } from "@/features/trips/types";
import { CURRENCIES, cn } from "@/lib/utils";

const ALL = Array.from(new Set([...POPULAR_CURRENCIES, ...CURRENCIES])).sort();
const QUICK_AMOUNTS = [1, 10, 100, 1000];

function fmt(n: number, code: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: code, maximumFractionDigits: n < 1 ? 4 : 2 }).format(n);
  } catch {
    return `${code} ${n.toFixed(2)}`;
  }
}

function CurrencyBox({ label, code, onCode, amount, onAmount, readOnly, className }: { label: string; code: string; onCode: (c: string) => void; amount: string; onAmount?: (v: string) => void; readOnly?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-3xl p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium opacity-80">{label}</span>
        <Select value={code} onChange={(e) => onCode(e.target.value)} className="w-auto border-transparent bg-black/5 py-1.5 pl-3 text-sm font-semibold dark:bg-white/10">
          {ALL.map((c) => <option key={c} value={c}>{c} · {currencyName(c)}</option>)}
        </Select>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-medium opacity-70">{currencySymbol(code)}</span>
        {readOnly ? (
          <p className="min-w-0 flex-1 truncate text-4xl font-semibold tracking-tight tabular-nums">{amount || "0"}</p>
        ) : (
          <input inputMode="decimal" value={amount} onChange={(e) => onAmount?.(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="min-w-0 flex-1 bg-transparent text-4xl font-semibold tracking-tight tabular-nums outline-none placeholder:opacity-40" />
        )}
      </div>
      <p className="mt-1 text-xs opacity-70">{currencyName(code)}</p>
    </div>
  );
}

export function ConvertPage() {
  const [params, setParams] = useSearchParams();
  const [home, setHome] = useHomeCurrency();
  const trips = useTrips() ?? [];
  const activeTrip = trips.filter((t) => tripStatus(t) !== "completed").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const [from, setFrom] = useState(params.get("from") ?? activeTrip?.currency ?? "USD");
  const [to, setTo] = useState(params.get("to") ?? home);
  const [amount, setAmount] = useState(params.get("amount") ?? "100");
  const [recent, setRecent] = useState<[string, string][]>([]);
  const { table, loading, refresh } = useRates(from);

  // If the user never chose a pair and home currency resolves later, follow it.
  useEffect(() => { if (!params.get("to")) setTo(home); }, [home]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getRecentPairs().then(setRecent); }, []);
  useEffect(() => {
    setParams((p) => { const n = new URLSearchParams(p); n.set("from", from); n.set("to", to); if (amount) n.set("amount", amount); return n; }, { replace: true });
    const t = setTimeout(() => { void pushRecentPair(from, to).then(getRecentPairs).then(setRecent); }, 1500);
    return () => clearTimeout(t);
  }, [from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = parseFloat(amount) || 0;
  const result = convertWith(table, num, from, to);
  const rate = convertWith(table, 1, from, to);
  const inverse = convertWith(table, 1, to, from);
  const swap = () => { setFrom(to); setTo(from); };

  const popularTargets = useMemo(() => Array.from(new Set([home, ...(activeTrip ? [activeTrip.currency] : []), ...POPULAR_CURRENCIES.slice(0, 10)])).filter((c) => c !== from).slice(0, 10), [home, activeTrip, from]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Convert" subtitle="Live exchange rates, cached for offline use." action={<button onClick={() => void refresh()} className={cn("rounded-full p-2.5 text-muted hover:bg-surface-2", loading && "animate-spin")} title="Refresh rates"><RefreshCw size={18} /></button>} />

      {table?.provider === "none" && <div className="mb-3 flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn"><WifiOff size={16} /> No rates available offline yet — connect once to cache them.</div>}

      <div className="relative">
        <CurrencyBox label="From" code={from} onCode={setFrom} amount={amount} onAmount={setAmount} className="bg-surface shadow-card" />
        <div className="relative z-10 -my-3.5 flex justify-center">
          <button onClick={swap} className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-md transition hover:brightness-110 active:scale-95" title="Swap currencies" aria-label="Swap currencies"><ArrowDownUp size={20} /></button>
        </div>
        <CurrencyBox label="To" code={to} onCode={setTo} amount={result != null ? new Intl.NumberFormat(undefined, { maximumFractionDigits: result < 1 ? 4 : 2 }).format(result) : "—"} readOnly className="bg-primary-container text-on-primary-container" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
        <span>{rate != null ? <>1 {from} = <b className="text-fg">{rate.toFixed(rate < 0.01 ? 6 : 4)}</b> {to} · 1 {to} = <b className="text-fg">{inverse?.toFixed(inverse && inverse < 0.01 ? 6 : 4)}</b> {from}</> : "Rate unavailable for this pair"}</span>
        {table?.date && <span>{table.stale ? "Cached" : "Updated"} {table.date}{table.provider === "frankfurter" ? " · ECB" : ""}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {QUICK_AMOUNTS.map((a) => <Chip key={a} active={num === a} onClick={() => setAmount(String(a))}>{a.toLocaleString()}</Chip>)}
        <button onClick={() => void setHome(to)} className={cn("ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition", home === to ? "text-accent" : "text-muted hover:bg-surface-2")} title="Set as home currency"><Star size={13} className={cn(home === to && "fill-current")} /> {home === to ? `${to} is home` : `Make ${to} home`}</button>
      </div>

      {recent.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-1 text-xs font-medium text-muted">Recent pairs</h2>
          <div className="flex flex-wrap gap-1.5">
            {recent.map(([a, b]) => <Chip key={a + b} active={a === from && b === to} onClick={() => { setFrom(a); setTo(b); }}>{a} → {b}</Chip>)}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-xs font-medium text-muted">{fmt(num || 1, from)} in other currencies</h2>
        <Card className="divide-y divide-line overflow-hidden">
          {popularTargets.map((c) => { const v = convertWith(table, num || 1, from, c); return (
            <button key={c} onClick={() => setTo(c)} className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-surface-2">
              <span><span className="font-semibold">{c}</span> <span className="text-xs text-muted">{currencyName(c)}</span>{c === home && <span className="ml-2 rounded-md bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-strong">Home</span>}{activeTrip && c === activeTrip.currency && c !== home && <span className="ml-2 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted">{activeTrip.city}</span>}</span>
              <span className="font-semibold tabular-nums">{v != null ? fmt(v, c) : "—"}</span>
            </button>
          ); })}
        </Card>
      </section>
    </div>
  );
}
