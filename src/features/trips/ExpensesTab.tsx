import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Wallet, RefreshCw } from "lucide-react";
import { Modal, Button, Field, Input, Select, Card, EmptyState, Badge, Avatar } from "@/components/ui";
import { put, newId, remove } from "@/lib/repo";
import { getSetting, setSetting } from "@/lib/db";
import { fetchRates } from "@/lib/services";
import { fmtMoney, fmtDate, CURRENCIES, today, cn } from "@/lib/utils";
import { useMemberMap, useMembers } from "@/features/family/hooks";
import { useExpenses } from "./hooks";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type Trip } from "./types";

export function useHomeCurrency() {
  const [cur, setCur] = useState("USD");
  useEffect(() => { getSetting("homeCurrency", "USD").then(setCur); }, []);
  return [cur, async (c: string) => { setCur(c); await setSetting("homeCurrency", c); }] as const;
}

function ExpenseForm({ open, onClose, trip }: { open: boolean; onClose: () => void; trip: Trip }) {
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<Expense>>({ tripId: trip.id, date: today() >= trip.startDate && today() <= trip.endDate ? today() : trip.startDate, category: "food", description: "", currency: trip.currency });
  const set = (k: keyof Expense, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.description?.trim() && form.amount && form.amount > 0;
  return (
    <Modal open={open} onClose={onClose} title="Add expense" size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={async () => { await put("expenses", { ...(form as Expense), id: newId() }); onClose(); }}>Add</Button></>}>
      <div className="space-y-4">
        <Field label="Description"><Input autoFocus value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Chilli crab at Jumbo" /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount"><Input type="number" min={0} step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
          <Field label="Currency"><Select value={form.currency} onChange={(e) => set("currency", e.target.value)} className="w-28">{Array.from(new Set([trip.currency, ...CURRENCIES])).map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={form.category} onChange={(e) => set("category", e.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.emoji} {c.label}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
        </div>
        {members.length > 0 && <Field label="Paid by"><Select value={form.paidById ?? ""} onChange={(e) => set("paidById", e.target.value || undefined)}><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>}
      </div>
    </Modal>
  );
}

export function ExpensesTab({ trip }: { trip: Trip }) {
  const expenses = useExpenses(trip.id);
  const members = useMemberMap();
  const [home, setHome] = useHomeCurrency();
  const [rates, setRates] = useState<{ rates: Record<string, number>; date: string; stale: boolean } | null>(null);
  const [add, setAdd] = useState(false);
  const load = () => fetchRates(trip.currency).then(setRates);
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [trip.currency]);

  const toLocal = (e: Expense) => (e.currency === trip.currency ? e.amount : rates?.rates[e.currency] ? e.amount / rates.rates[e.currency] : e.amount);
  const toHome = (localAmt: number) => (home === trip.currency ? localAmt : rates?.rates[home] ? localAmt * rates.rates[home] : null);
  const totalLocal = useMemo(() => expenses.reduce((s, e) => s + toLocal(e), 0), [expenses, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalHome = toHome(totalLocal);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: expenses.filter((e) => e.category === c.value).reduce((s, e) => s + toLocal(e), 0) })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const days = Math.max(1, new Set(expenses.map((e) => e.date)).size);

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Total spent</p><p className="mt-1 text-2xl font-extrabold">{fmtMoney(totalLocal, trip.currency)}</p>{totalHome != null && <p className="text-sm text-muted">≈ {fmtMoney(totalHome, home)}</p>}</Card>
        <Card className="p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted">Per day</p><p className="mt-1 text-2xl font-extrabold">{fmtMoney(totalLocal / days, trip.currency)}</p><p className="text-sm text-muted">{expenses.length} expenses · {days} day{days > 1 ? "s" : ""}</p></Card>
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Home currency</p>
          <div className="mt-1 flex items-center gap-2"><Select value={home} onChange={(e) => setHome(e.target.value)} className="py-1.5">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select><button onClick={load} className="rounded-lg p-2 text-muted hover:bg-surface-2" title="Refresh rates"><RefreshCw size={14} /></button></div>
          <p className="mt-1 text-[11px] text-muted">{rates?.rates[home] ? `1 ${trip.currency} = ${rates.rates[home].toFixed(4)} ${home}` : "Rates unavailable"}{rates?.stale && " · cached"}{rates?.date && ` · ${rates.date}`}</p>
        </Card>
      </div>
      {byCat.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">{byCat.map((c, i) => <div key={c.value} style={{ width: `${(c.total / totalLocal) * 100}%`, opacity: 1 - i * 0.12 }} className="bg-accent" />)}</div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{byCat.map((c) => <span key={c.value}>{c.emoji} {c.label} <b>{fmtMoney(c.total, trip.currency)}</b></span>)}</div>
        </Card>
      )}
      <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">Expenses</h2><Button size="sm" onClick={() => setAdd(true)}><Plus size={14} /> Add expense</Button></div>
      {expenses.length === 0 ? <EmptyState icon={<Wallet />} title="No expenses logged" hint="Track spending in any currency; it's converted to your home currency automatically." /> : (
        <Card className="divide-y divide-line">
          {expenses.map((e) => {
            const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category)!;
            const payer = e.paidById ? members.get(e.paidById) : undefined;
            const homeAmt = toHome(toLocal(e));
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{cat.emoji}</span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold">{e.description}</p><p className="flex items-center gap-1.5 text-xs text-muted">{fmtDate(e.date, "EEE d MMM")}{payer && <><span>·</span><Avatar name={payer.name} size={14} /> {payer.name}</>}</p></div>
                <div className="text-right"><p className="font-bold">{fmtMoney(e.amount, e.currency)}</p>{homeAmt != null && e.currency !== home && <p className="text-xs text-muted">≈ {fmtMoney(homeAmt, home)}</p>}{e.currency !== trip.currency && <Badge className="mt-0.5">≈ {fmtMoney(toLocal(e), trip.currency)}</Badge>}</div>
                <button onClick={() => remove("expenses", e.id)} className={cn("rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger")}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </Card>
      )}
      {add && <ExpenseForm open onClose={() => setAdd(false)} trip={trip} />}
    </div>
  );
}
