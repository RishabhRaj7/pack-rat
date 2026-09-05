import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plane, TrainFront, Hotel, Wallet, ArrowRight, Users, FolderLock, WifiOff, ShieldAlert, ArrowLeftRight, MapPin, Plus, CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Badge, Avatar, StatusDot, Button } from "@/components/ui";
import { DOCUMENT_ICONS } from "@/components/icons";
import { useMemberMap } from "@/features/family/hooks";
import { useTrips, useAllFlights, useAllTrains, useAllHotels, useAllExpenses } from "@/features/trips/hooks";
import { tripStatus, placeStatus, type Trip } from "@/features/trips/types";
import { expiryStatus, DOCUMENT_TYPES } from "@/features/documents/types";
import { useSyncStatus } from "@/lib/sync";
import { useHomeCurrency, useRates } from "@/lib/prefs";
import { convertWith, parseFlightNumber } from "@/lib/services";
import { AirlineLogo } from "@/features/journeys/FlightCard";
import { fmtDate, fmtTime, daysBetween, today, fmtMoney, cn } from "@/lib/utils";

function SectionTitle({ title, to, action }: { title: string; to?: string; action?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-semibold text-muted">{title}</h2>
      {to && <Link to={to} className="text-xs font-medium text-accent">{action ?? "View all"}</Link>}
    </div>
  );
}

function StatTile({ to, icon: I, value, label }: { to: string; icon: typeof Users; value: string | number; label: string }) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-3 p-3.5 transition hover:bg-surface-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"><I size={18} /></div>
        <div><p className="text-lg font-semibold leading-tight">{value}</p><p className="text-xs text-muted">{label}</p></div>
      </Card>
    </Link>
  );
}

function NextTripHero({ trip }: { trip: Trip }) {
  const places = useLiveQuery(() => db.places.where("tripId").equals(trip.id).toArray(), [trip.id]) ?? [];
  const members = useMemberMap();
  const status = tripStatus(trip);
  const counts = { action: 0, progress: 0, ready: 0 };
  places.forEach((p) => counts[placeStatus(p)]++);
  const daysTo = daysBetween(today(), trip.startDate);
  const dayOf = status === "ongoing" ? daysBetween(trip.startDate, today()) + 1 : null;
  return (
    <Link to={`/trips/${trip.id}`} className="block">
      <Card className="overflow-hidden bg-primary-container text-on-primary-container transition hover:brightness-[0.98]">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium opacity-80">{status === "ongoing" ? `Day ${dayOf} of ${daysBetween(trip.startDate, trip.endDate) + 1}` : daysTo === 0 ? "Starts today" : `In ${daysTo} day${daysTo === 1 ? "" : "s"}`}</p>
              <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight">{trip.title}</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm opacity-85"><MapPin size={13} /> {trip.city}, {trip.country}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm opacity-85"><CalendarDays size={13} /> {fmtDate(trip.startDate, "EEE d MMM")} – {fmtDate(trip.endDate, "EEE d MMM")}</p>
            </div>
            <span className="flex -space-x-2">{trip.travellerIds.slice(0, 4).map((id) => { const m = members.get(id); return m ? <Avatar key={id} name={m.name} size={30} className="ring-primary-container" /> : null; })}</span>
          </div>
        </div>
        <div className="flex items-center justify-between bg-black/5 px-5 py-3 text-sm dark:bg-white/5">
          {places.length ? (
            <span className="flex items-center gap-3 font-medium"><span className="flex items-center gap-1"><StatusDot status="ready" /> {counts.ready}</span><span className="flex items-center gap-1"><StatusDot status="progress" /> {counts.progress}</span><span className="flex items-center gap-1"><StatusDot status="action" /> {counts.action}</span><span className="opacity-70">of {places.length} places</span></span>
          ) : <span className="opacity-80">No places added yet</span>}
          <span className="flex items-center gap-1 font-medium">Open <ArrowRight size={14} /></span>
        </div>
      </Card>
    </Link>
  );
}

export function HomePage() {
  const trips = useTrips() ?? [];
  const flights = useAllFlights();
  const trains = useAllTrains();
  const hotels = useAllHotels();
  const expenses = useAllExpenses();
  const docs = useLiveQuery(() => db.documents.toArray(), []) ?? [];
  const members = useMemberMap();
  const sync = useSyncStatus();
  const [home] = useHomeCurrency();
  const now = today();

  const active = trips.filter((t) => tripStatus(t) !== "completed").sort((a, b) => a.startDate.localeCompare(b.startDate));
  const next = active[0];
  const tripMap = new Map(trips.map((t) => [t.id, t]));
  const { table } = useRates(home);

  // Upcoming journeys (flights + trains) across trips and ad-hoc, next 5.
  const journeys = [
    ...flights.map((f) => ({ kind: "flight" as const, id: f.id, at: f.departAt, title: `${f.from || "?"} → ${f.to || "?"}`, sub: `${f.airline || f.airlineCode || ""} ${f.flightNumber}`.trim(), code: f.airlineCode ?? parseFlightNumber(f.flightNumber)?.code, tripId: f.tripId })),
    ...trains.map((t) => ({ kind: "train" as const, id: t.id, at: t.departAt, title: `${t.from || "?"} → ${t.to || "?"}`, sub: `${t.trainName || t.operator || ""} ${t.trainNumber}`.trim(), code: undefined, tripId: t.tripId })),
  ].filter((j) => j.at.slice(0, 10) >= now).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5);

  const upcomingStays = hotels.filter((h) => h.checkOut >= now).sort((a, b) => a.checkIn.localeCompare(b.checkIn)).slice(0, 3);

  // Spend this month + for the active trip, in home currency.
  const month = now.slice(0, 7);
  const sumHome = (list: typeof expenses) => list.reduce((s, e) => s + (convertWith(table, e.amount, e.currency, home) ?? 0), 0);
  const monthSpend = sumHome(expenses.filter((e) => e.date.startsWith(month)));
  const nextTripSpend = next ? sumHome(expenses.filter((e) => e.tripId === next.id)) : 0;

  const reminders = docs.map((d) => ({ d, ...expiryStatus(d.expiryDate) })).filter((x) => x.status !== "ok" && x.status !== "none").sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const unconfirmed = [...flights, ...trains, ...hotels].filter((x) => x.status !== "done" && ("departAt" in x ? x.departAt.slice(0, 10) >= now : x.checkOut >= now)).length;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">{greet}</p>
        <h1 className="text-[28px] font-semibold tracking-tight">{next ? (tripStatus(next) === "ongoing" ? `Enjoy ${next.city}` : `${next.city} is coming up`) : "Where to next?"}</h1>
      </div>
      {!sync.online && <div className="flex items-center gap-2 rounded-2xl bg-warn-soft px-4 py-2.5 text-sm font-medium text-warn"><WifiOff size={16} /> You're offline — viewing saved data. Changes will sync later.</div>}

      {next ? <NextTripHero trip={next} /> : (
        <Card className="flex items-center justify-between gap-4 p-5"><div><p className="font-semibold">No upcoming trips</p><p className="text-sm text-muted">Plan a destination or log an ad-hoc flight.</p></div><Link to="/trips"><Button><Plus size={16} /> Plan a trip</Button></Link></Card>
      )}

      {(reminders.length > 0 || unconfirmed > 0) && (
        <div className="flex flex-wrap gap-2">
          {reminders.length > 0 && <Link to="/vault"><Badge tone={reminders.some((r) => r.status !== "soon") ? "danger" : "warn"} className="px-3 py-1.5 text-xs"><ShieldAlert size={13} /> {reminders.length} document{reminders.length === 1 ? "" : "s"} expiring</Badge></Link>}
          {unconfirmed > 0 && <Link to="/trips?view=flights"><Badge tone="warn" className="px-3 py-1.5 text-xs">{unconfirmed} booking{unconfirmed === 1 ? "" : "s"} unconfirmed</Badge></Link>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <SectionTitle title="Upcoming journeys" to="/trips?view=flights" />
          {journeys.length === 0 ? <Card className="p-4 text-sm text-muted">No flights or trains coming up. <Link to="/trips?view=flights" className="font-medium text-accent">Add one</Link> — it doesn't need a trip.</Card> : (
            <Card className="divide-y divide-line overflow-hidden">
              {journeys.map((j) => { const t = j.tripId ? tripMap.get(j.tripId) : undefined; const d = daysBetween(now, j.at.slice(0, 10)); return (
                <Link key={j.id} to={t ? `/trips/${t.id}?tab=stay` : `/trips?view=${j.kind}s`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  {j.kind === "flight" ? <AirlineLogo code={j.code} size={36} /> : <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"><TrainFront size={16} /></div>}
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{j.title}</p><p className="truncate text-xs text-muted">{j.sub}{t ? ` · ${t.title}` : " · Ad-hoc"}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold">{d === 0 ? "Today" : d === 1 ? "Tomorrow" : fmtDate(j.at.slice(0, 10), "EEE d MMM")}</p><p className="text-xs text-muted">{fmtTime(j.at)}</p></div>
                </Link>
              ); })}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle title="Stays" to={next ? `/trips/${next.id}?tab=stay` : "/trips"} />
          {upcomingStays.length === 0 ? <Card className="p-4 text-sm text-muted">No upcoming hotel stays.</Card> : (
            <Card className="divide-y divide-line overflow-hidden">
              {upcomingStays.map((h) => { const t = tripMap.get(h.tripId); return (
                <Link key={h.id} to={`/trips/${h.tripId}?tab=stay`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"><Hotel size={16} /></div>
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{h.name}</p><p className="truncate text-xs text-muted">{t?.city ?? ""}{h.status !== "done" ? " · Unconfirmed" : ""}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold">{fmtDate(h.checkIn, "d MMM")} – {fmtDate(h.checkOut, "d MMM")}</p><p className="text-xs text-muted">{daysBetween(h.checkIn, h.checkOut)} nights</p></div>
                </Link>
              ); })}
            </Card>
          )}
        </section>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Wallet size={13} /> Spending</p><Link to={next ? `/trips/${next.id}?tab=expenses` : "/trips"} className="text-xs font-medium text-accent">Details</Link></div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><p className="text-xl font-semibold tracking-tight">{fmtMoney(monthSpend, home)}</p><p className="text-xs text-muted">This month</p></div>
            {next && <div><p className="text-xl font-semibold tracking-tight">{fmtMoney(nextTripSpend, home)}</p><p className="truncate text-xs text-muted">{next.title}</p></div>}
          </div>
        </Card>
        <Link to={`/convert?from=${next?.currency ?? "USD"}&to=${home}`} className="block">
          <Card className="flex h-full items-center gap-3 p-4 transition hover:bg-surface-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"><ArrowLeftRight size={20} /></div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Currency converter</p>
              <p className="truncate text-xs text-muted">{next && next.currency !== home ? (() => { const r = convertWith(table, 1, next.currency, home); return r ? `1 ${next.currency} = ${r.toFixed(r < 0.1 ? 4 : 2)} ${home}` : `${next.currency} → ${home}`; })() : `Home currency ${home}`}</p>
            </div>
            <ArrowRight size={16} className="text-muted" />
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile to="/trips" icon={Plane} value={active.length} label={`Active trip${active.length === 1 ? "" : "s"}`} />
        <StatTile to="/trips?view=flights" icon={TrainFront} value={flights.length + trains.length} label="Journeys" />
        <StatTile to="/family" icon={Users} value={members.size} label="Family" />
        <StatTile to="/vault" icon={FolderLock} value={docs.length} label="Documents" />
      </div>

      {reminders.length > 0 && (
        <section>
          <SectionTitle title="Expiring documents" to="/vault" action="Open vault" />
          <Card className="divide-y divide-line overflow-hidden">
            {reminders.slice(0, 5).map(({ d, status, days }) => { const m = members.get(d.memberId); const t = DOCUMENT_TYPES.find((x) => x.value === d.type)!; const I = DOCUMENT_ICONS[d.type]; return (
              <Link key={d.id} to={`/family/${d.memberId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <div className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", status === "soon" ? "bg-warn-soft text-warn" : "bg-danger-soft text-danger")}><I size={16} /></div>
                <div className="flex-1"><p className="text-sm font-semibold">{m?.name} · {d.label || t.label}</p><p className="text-xs text-muted">Expires {fmtDate(d.expiryDate)}</p></div>
                <Badge tone={status === "soon" ? "warn" : "danger"}>{status === "expired" ? "Expired" : `${days} days`}</Badge>
              </Link>
            ); })}
          </Card>
        </section>
      )}

      {members.size > 0 && (
        <section>
          <SectionTitle title="Travellers" to="/family" action="Manage" />
          <div className="flex flex-wrap gap-2">{[...members.values()].map((m) => <Link key={m.id} to={`/family/${m.id}`} className="flex items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 text-sm font-medium shadow-card hover:bg-surface-2"><Avatar name={m.name} size={26} /> {m.name}</Link>)}</div>
        </section>
      )}
    </div>
  );
}
