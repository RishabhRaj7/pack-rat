import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, Plane, CalendarDays, Users } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, Input, Chip, Card, Badge, EmptyState, StatusDot, Avatar } from "@/components/ui";
import { useMemberMap } from "@/features/family/hooks";
import { fmtDate, daysBetween, flag, today } from "@/lib/utils";
import { SyncBadge } from "@/components/sync";
import { useTrips } from "./hooks";
import { TripForm } from "./TripForm";
import { placeStatus, tripStatus, type Trip, type TripStatus } from "./types";

function TripCard({ trip }: { trip: Trip }) {
  const places = useLiveQuery(() => db.places.where("tripId").equals(trip.id).toArray(), [trip.id]) ?? [];
  const members = useMemberMap();
  const status = tripStatus(trip);
  const counts = { action: 0, progress: 0, ready: 0 };
  places.forEach((p) => counts[placeStatus(p)]++);
  const daysTo = daysBetween(today(), trip.startDate);
  return (
    <Link to={`/trips/${trip.id}`}>
      <Card className="group overflow-hidden transition hover:border-accent/50">
        <div className="relative flex h-24 items-end bg-gradient-to-br from-teal-deep via-teal to-mint p-4 dark:from-navy dark:via-teal-deep dark:to-teal">
          <span className="absolute right-4 top-3 text-4xl drop-shadow">{trip.coverEmoji}</span>
          <div>
            <Badge className="bg-white/20 text-white backdrop-blur">{status === "ongoing" ? "Happening now" : status === "completed" ? "Completed" : daysTo === 0 ? "Starts today" : `In ${daysTo} days`}</Badge>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2"><h3 className="text-lg font-extrabold tracking-tight">{trip.title}</h3><SyncBadge table="trips" id={trip.id} className="mt-1.5" /></div>
          <p className="text-sm text-muted">{flag(trip.countryCode)} {trip.city}, {trip.country}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><CalendarDays size={13} /> {fmtDate(trip.startDate, "d MMM")} – {fmtDate(trip.endDate)} · {daysBetween(trip.startDate, trip.endDate) + 1} days</p>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1"><StatusDot status="ready" /> {counts.ready}</span>
              <span className="flex items-center gap-1"><StatusDot status="progress" /> {counts.progress}</span>
              <span className="flex items-center gap-1"><StatusDot status="action" /> {counts.action}</span>
              <span className="text-muted">· {places.length} places</span>
            </div>
            <div className="flex -space-x-2">
              {trip.travellerIds.slice(0, 4).map((id) => {
                const m = members.get(id);
                return m ? <Avatar key={id} name={m.name} size={24} /> : null;
              })}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function TripsPage() {
  const trips = useTrips();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TripStatus | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [add, setAdd] = useState(false);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (trips ?? [])
      .filter((t) => status === "all" || tripStatus(t) === status)
      .filter((t) => !from || t.endDate >= from)
      .filter((t) => !to || t.startDate <= to)
      .filter((t) => !s || [t.title, t.country, t.city, t.countryCode].join(" ").toLowerCase().includes(s))
      .sort((a, b) => {
        const order = { ongoing: 0, upcoming: 1, completed: 2 };
        return order[tripStatus(a)] - order[tripStatus(b)] || a.startDate.localeCompare(b.startDate);
      });
  }, [trips, q, status, from, to]);

  return (
    <div>
      <PageHeader title="Trips" subtitle="Every destination uses the same trip template — add a country by adding data, not code." action={<Button onClick={() => setAdd(true)}><Plus size={16} /> New Trip</Button>} />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or city…" className="pl-10" />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", "upcoming", "ongoing", "completed"] as const).map((s) => (
          <Chip key={s} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s}</Chip>
        ))}
        {(from || to) && <Chip onClick={() => { setFrom(""); setTo(""); }}>Clear dates ✕</Chip>}
      </div>
      {trips && trips.length === 0 ? (
        <EmptyState icon={<Plane />} title="No trips yet" hint="Start planning your next destination." action={<Button onClick={() => setAdd(true)}><Plus size={16} /> New Trip</Button>} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search />} title="No trips match your filters" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((t) => <TripCard key={t.id} trip={t} />)}</div>
      )}
      <p className="mt-8 flex items-center gap-2 text-xs text-muted"><Users size={12} /> Tip: assign travellers to a trip to see their passport expiry warnings on the trip page.</p>
      {add && <TripForm open onClose={() => setAdd(false)} />}
    </div>
  );
}
