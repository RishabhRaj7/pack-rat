import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Wallet, RefreshCw, Pencil, ArrowLeftRight } from "lucide-react";
import { Modal, Button, Field, Input, Select, Card, EmptyState, Badge, Avatar } from "@/components/ui";
import { EXPENSE_ICONS } from "@/components/icons";
import { put, newId, remove } from "@/lib/repo";
import { convertWith, POPULAR_CURRENCIES, currencyName } from "@/lib/services";
import { useHomeCurrency, useRates } from "@/lib/prefs";
import { fmtMoney, fmtDate, CURRENCIES, today, cn } from "@/lib/utils";
import { useMemberMap, useMembers } from "@/features/family/hooks";
import { useExpenses } from "./hooks";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseCategory, type Trip } from "./types";

export { useHomeCurrency } from "@/lib/prefs";

const ALL_CURRENCIES = Array.from(new Set([...POPULAR_CURRENCIES, ...CURRENCIES])).sort();

function ExpenseForm({ open, onClose, trip, expense }: { open: boolean; onClose: () => void; trip: Trip; expense?: Expense }) {
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<Expense>>(expense ?? { tripId: trip.id, date: today() >= trip.startDate && today() <= trip.endDate ? today() : trip.startDate, category: "food", description: "", currency: trip.currency });
  const set = (k: keyof Expense, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.description?.trim() && form.amount && form.amount > 0;
  return (
    <Modal open={open} onClose={onClose} title={expense ? "Edit expense" : "Add expense"} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={async () => { await put("expenses", { ...(form as Expense), id: form.id ?? newId() }); onClose(); }}>{expense ? "Save" : "Add"}</Button></>}>
      <div className="space-y-4">
        <Field label="Description"><Input autoFocus value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Chilli crab at Jumbo" /></Field>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label="Amount"><Input type="number" inputMode="decimal" min={0} step="0.01" value={form.amount ?? ""} onChange={(e) => set("amount", Number(e.target.value))} /></Field>
          <Field label="Currency"><Select value={form.currency} onChange={(e) => set("currency", e.target.value)} className="w-28">{Array.from(new Set([trip.currency, ...ALL_CURRENCIES])).map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Category">
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => { const I = EXPENSE_ICONS[c.value]; const on = form.category === c.value; return <button key={c.value} type="button" onClick={() => set("category", c.value as ExpenseCategory)} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition", on ? "border-transparent bg-accent-soft text-accent-strong" : "border-line text-fg hover:bg-surface-2")}><I size={13} /> {c.label}</button>; })}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date"><Input type="date" value={form.date ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
          {members.length > 0 && <Field label="Paid by"><Select value={form.paidById ?? ""} onChange={(e) => set("paidById", e.target.value || undefined)}><option value="">—</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>}
        </div>
      </div>
    </Modal>
  );
}

export function ExpensesTab({ trip }: { trip: Trip }) {
  const expenses = useExpenses(trip.id);
  const members = useMemberMap();
  const [home, setHome] = useHomeCurrency();
  const { table: rates, loading, refresh } = useRates(trip.currency);
  const [add, setAdd] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const toLocal = (e: Expense) => convertWith(rates, e.amount, e.currency, trip.currency) ?? (e.currency === trip.currency ? e.amount : 0);
  const toHome = (localAmt: number) => convertWith(rates, localAmt, trip.currency, home);
  const totalLocal = useMemo(() => expenses.reduce((s, e) => s + toLocal(e), 0), [expenses, rates]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalHome = toHome(totalLocal);
  const byCat = EXPENSE_CATEGORIES.map((c) => ({ ...c, total: expenses.filter((e) => e.category === c.value).reduce((s, e) => s + toLocal(e), 0) })).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const days = Math.max(1, new Set(expenses.map((e) => e.date)).size);
  const rate = convertWith(rates, 1, trip.currency, home);
  const sameCurrency = home === trip.currency;

  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="bg-primary-container p-4 text-on-primary-container">
          <p className="text-xs font-medium opacity-80">Total spent</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{fmtMoney(totalLocal, trip.currency)}</p>
          {!sameCurrency && <p className="text-sm opacity-80">{totalHome != null ? `≈ ${fmtMoney(totalHome, home)}` : "Conversion unavailable"}</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted">Per day</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{fmtMoney(totalLocal / days, trip.currency)}</p>
          <p className="text-sm text-muted">{expenses.length} expense{expenses.length === 1 ? "" : "s"} · {days} day{days > 1 ? "s" : ""}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted">Home currency</p>
            <button onClick={() => void refresh()} className={cn("rounded-full p-1.5 text-muted hover:bg-surface-2", loading && "animate-spin")} title="Refresh live rate"><RefreshCw size={13} /></button>
          </div>
          <Select value={home} onChange={(e) => void setHome(e.target.value)} className="mt-1 py-1.5">{ALL_CURRENCIES.map((c) => <option key={c} value={c}>{c} · {currencyName(c)}</option>)}</Select>
          <p className="mt-1.5 text-[11px] text-muted">
            {sameCurrency ? "Trip is in your home currency." : rate ? `1 ${trip.currency} = ${rate.toFixed(rate < 0.1 ? 5 : 4)} ${home}` : "Rate unavailable"}
            {rates?.date && !sameCurrency && ` · ${rates.stale ? "cached" : "live"} ${rates.date}`}
          </p>
          <Link to={`/convert?from=${trip.currency}&to=${home}`} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-accent"><ArrowLeftRight size={11} /> Open converter</Link>
        </Card>
      </div>

      {byCat.length > 0 && (
        <Card className="mb-4 p-4">
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">{byCat.map((c, i) => <div key={c.value} style={{ width: `${(c.total / totalLocal) * 100}%`, opacity: 1 - i * 0.14 }} className="bg-accent" />)}</div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">{byCat.map((c) => { const I = EXPENSE_ICONS[c.value]; return <span key={c.value} className="flex items-center gap-1.5 text-muted"><I size={13} /> {c.label} <b className="text-fg">{fmtMoney(c.total, trip.currency)}</b></span>; })}</div>
        </Card>
      )}

      <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold">Expenses</h2><Button size="sm" variant="secondary" onClick={() => setAdd(true)}><Plus size={14} /> Add expense</Button></div>
      {expenses.length === 0 ? <EmptyState icon={<Wallet />} title="No expenses logged" hint="Track spending in any currency — it's converted with live rates to the trip and your home currency." action={<Button size="sm" onClick={() => setAdd(true)}><Plus size={14} /> Add expense</Button>} /> : (
        <Card className="divide-y divide-line overflow-hidden">
          {expenses.map((e) => {
            const I = EXPENSE_ICONS[e.category] ?? Wallet;
            const payer = e.paidById ? members.get(e.paidById) : undefined;
            const homeAmt = toHome(toLocal(e));
            return (
              <div key={e.id} className="group flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted"><I size={16} /></div>
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.description}</p><p className="flex items-center gap-1.5 text-xs text-muted">{fmtDate(e.date, "EEE d MMM")}{payer && <><span>·</span><Avatar name={payer.name} size={14} /> {payer.name}</>}</p></div>
                <div className="text-right">
                  <p className="font-semibold">{fmtMoney(e.amount, e.currency)}</p>
                  {homeAmt != null && e.currency !== home && <p className="text-xs text-muted">≈ {fmtMoney(homeAmt, home)}</p>}
                  {e.currency !== trip.currency && e.currency !== home && <Badge className="mt-0.5">≈ {fmtMoney(toLocal(e), trip.currency)}</Badge>}
                </div>
                <div className="flex shrink-0">
                  <button onClick={() => setEditing(e)} className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={14} /></button>
                  <button onClick={() => remove("expenses", e.id)} className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </Card>
      )}
      {add && <ExpenseForm open onClose={() => setAdd(false)} trip={trip} />}
      {editing && <ExpenseForm open onClose={() => setEditing(null)} trip={trip} expense={editing} />}
    </div>
  );
}
