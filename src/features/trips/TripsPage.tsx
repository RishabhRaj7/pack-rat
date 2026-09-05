import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Search, Plane, TrainFront, Map as MapIcon, ChevronRight, X } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, Input, Chip, Card, EmptyState, StatusDot, Avatar } from "@/components/ui";
import { useMemberMap } from "@/features/family/hooks";
import { fmtDate, daysBetween, today, cn } from "@/lib/utils";
import { smartFilter, dateRangeWords, dateWords } from "@/lib/search";
import { useTrips, useAllFlights, useAllTrains } from "./hooks";
import { TripForm } from "./TripForm";
import { placeStatus, tripStatus, NO_TRIP, type Trip, type TripStatus } from "./types";
import { FlightCard, FlightForm } from "@/features/journeys/FlightCard";
import { TrainCard, TrainForm } from "@/features/journeys/TrainCard";

type View = "trips" | "flights" | "trains";
const STATUS_LABEL: Record<TripStatus, string> = { upcoming: "Upcoming", ongoing: "Happening now", completed: "Completed" };

function TripRow({ trip }: { trip: Trip }) {
  const places = useLiveQuery(() => db.places.where("tripId").equals(trip.id).toArray(), [trip.id]) ?? [];
  const members = useMemberMap();
  const status = tripStatus(trip);
  const counts = { action: 0, progress: 0, ready: 0 };
  places.forEach((p) => counts[placeStatus(p)]++);
  const daysTo = daysBetween(today(), trip.startDate);
  const when = status === "ongoing" ? "Happening now" : status === "completed" ? "Completed" : daysTo === 0 ? "Starts today" : `In ${daysTo} day${daysTo === 1 ? "" : "s"}`;
  return (
    <Link to={`/trips/${trip.id}`} className="block">
      <Card className="flex items-center gap-4 p-4 transition hover:bg-surface-2">
        <div className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl", status === "completed" ? "bg-surface-2 text-muted" : "bg-primary-container text-on-primary-container")}>
          <span className="text-[10px] font-medium uppercase leading-none opacity-80">{fmtDate(trip.startDate, "MMM")}</span>
          <span className="text-xl font-semibold leading-tight">{fmtDate(trip.startDate, "d")}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold">{trip.title}</h3>
            <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium", status === "ongoing" ? "bg-ok-soft text-ok" : status === "completed" ? "bg-surface-2 text-muted" : "bg-accent-soft text-accent-strong")}>{when}</span>
          </div>
          <p className="truncate text-sm text-muted">{trip.city}, {trip.country} · {fmtDate(trip.startDate, "d MMM")} – {fmtDate(trip.endDate, "d MMM")} · {daysBetween(trip.startDate, trip.endDate) + 1} days</p>
          <div className="mt-1.5 flex items-center gap-3 text-xs">
            {places.length > 0 ? (
              <span className="flex items-center gap-2 text-muted">
                {counts.ready > 0 && <span className="flex items-center gap-1"><StatusDot status="ready" /> {counts.ready}</span>}
                {counts.progress > 0 && <span className="flex items-center gap-1"><StatusDot status="progress" /> {counts.progress}</span>}
                {counts.action > 0 && <span className="flex items-center gap-1"><StatusDot status="action" /> {counts.action}</span>}
                <span>{places.length} place{places.length === 1 ? "" : "s"}</span>
              </span>
            ) : <span className="text-muted">No places yet</span>}
            <span className="ml-auto flex -space-x-1.5">{trip.travellerIds.slice(0, 4).map((id) => { const m = members.get(id); return m ? <Avatar key={id} name={m.name} size={20} /> : null; })}</span>
          </div>
        </div>
        <ChevronRight size={18} className="shrink-0 text-muted" />
      </Card>
    </Link>
  );
}

export function TripsPage() {
  const trips = useTrips();
  const flights = useAllFlights();
  const trains = useAllTrains();
  const [params, setParams] = useSearchParams();
  const view: View = (["trips", "flights", "trains"] as const).includes(params.get("view") as View) ? (params.get("view") as View) : "trips";
  const setView = (v: View) => setParams((p) => { const n = new URLSearchParams(p); if (v === "trips") n.delete("view"); else n.set("view", v); return n; }, { replace: true });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<TripStatus | "all">("all");
  const [scope, setScope] = useState<"all" | "adhoc" | "upcoming">("upcoming");
  const [add, setAdd] = useState(false);
  const [addFlight, setAddFlight] = useState(false);
  const [addTrain, setAddTrain] = useState(false);

  // Index child records so searching "Jumbo" or "SQ423" finds the trip they belong to.
  const places = useLiveQuery(() => db.places.toArray(), []) ?? [];
  const hotels = useLiveQuery(() => db.hotels.toArray(), []) ?? [];
  const tripMap = useMemo(() => new Map((trips ?? []).map((t) => [t.id, t])), [trips]);

  const filteredTrips = useMemo(() => {
    const base = (trips ?? []).filter((t) => status === "all" || tripStatus(t) === status);
    const list = smartFilter(base, q, (t) => [
      { value: [t.title, t.city, t.country, t.countryCode], weight: 2 },
      { value: [STATUS_LABEL[tripStatus(t)], tripStatus(t)] },
      { value: dateRangeWords(t.startDate, t.endDate) },
      { value: [t.notes, t.currency] },
      { value: places.filter((p) => p.tripId === t.id).flatMap((p) => [p.name, p.address]) },
      { value: hotels.filter((h) => h.tripId === t.id).flatMap((h) => [h.name, h.confirmation]) },
      { value: flights.filter((f) => f.tripId === t.id).flatMap((f) => [f.flightNumber, f.airline, f.from, f.to, f.confirmation]) },
      { value: trains.filter((x) => x.tripId === t.id).flatMap((x) => [x.trainNumber, x.trainName, x.from, x.to, x.pnr]) },
    ]);
    if (q.trim()) return list;
    return list.sort((a, b) => { const o = { ongoing: 0, upcoming: 1, completed: 2 }; return o[tripStatus(a)] - o[tripStatus(b)] || (tripStatus(a) === "completed" ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)); });
  }, [trips, q, status, places, hotels, flights, trains]);

  const scoped = <T extends { tripId: string; departAt: string }>(items: T[]) => items.filter((x) => (scope === "adhoc" ? x.tripId === NO_TRIP : scope === "upcoming" ? x.departAt.slice(0, 10) >= today() : true));
  const filteredFlights = useMemo(() => smartFilter(scoped(flights), q, (f) => [{ value: [f.flightNumber, f.airline, f.airlineCode, f.from, f.to], weight: 2 }, { value: [f.fromName, f.toName, f.confirmation, f.seats] }, { value: dateWords(f.departAt) }, { value: tripMap.get(f.tripId)?.title }]).sort((a, b) => (scope === "upcoming" ? a.departAt.localeCompare(b.departAt) : b.departAt.localeCompare(a.departAt))), [flights, q, scope, tripMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTrains = useMemo(() => smartFilter(scoped(trains), q, (t) => [{ value: [t.trainNumber, t.trainName, t.operator, t.from, t.to], weight: 2 }, { value: [t.pnr, t.coach, t.seats] }, { value: dateWords(t.departAt) }, { value: tripMap.get(t.tripId)?.title }]).sort((a, b) => (scope === "upcoming" ? a.departAt.localeCompare(b.departAt) : b.departAt.localeCompare(a.departAt))), [trains, q, scope, tripMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const adhocCount = flights.filter((f) => f.tripId === NO_TRIP).length + trains.filter((t) => t.tripId === NO_TRIP).length;
  const addAction = view === "trips" ? <Button onClick={() => setAdd(true)}><Plus size={16} /> New trip</Button> : view === "flights" ? <Button onClick={() => setAddFlight(true)}><Plus size={16} /> Flight</Button> : <Button onClick={() => setAddTrain(true)}><Plus size={16} /> Train</Button>;

  return (
    <div>
      <PageHeader title="Trips" subtitle={view === "trips" ? `${trips?.length ?? 0} trip${trips?.length === 1 ? "" : "s"}${adhocCount ? ` · ${adhocCount} ad-hoc journey${adhocCount === 1 ? "" : "s"}` : ""}` : view === "flights" ? "All flights — inside trips and ad-hoc." : "All train journeys — inside trips and ad-hoc."} action={addAction} />

      {/* View switch (M3 segmented) */}
      <div className="mb-4 inline-flex overflow-hidden rounded-full border border-line">
        {([{ v: "trips", l: "Trips", I: MapIcon }, { v: "flights", l: "Flights", I: Plane }, { v: "trains", l: "Trains", I: TrainFront }] as const).map(({ v, l, I }) => (
          <button key={v} onClick={() => setView(v)} className={cn("flex items-center gap-1.5 border-r border-line px-4 py-2 text-sm font-medium transition last:border-r-0", view === v ? "bg-accent-soft text-accent-strong" : "hover:bg-surface-2")}><I size={15} /> {l}</button>
        ))}
      </div>

      <div className="mb-3 relative">
        <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === "trips" ? "Search trips, places, hotels, flight numbers, months…" : view === "flights" ? "Search flight number, airline, airport, month…" : "Search train number, station, PNR…"} className="rounded-full bg-surface pl-11 pr-10 py-3 shadow-card border-transparent" />
        {q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:bg-surface-2"><X size={14} /></button>}
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {view === "trips"
          ? (["all", "upcoming", "ongoing", "completed"] as const).map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)} className="capitalize">{s}</Chip>)
          : (["upcoming", "all", "adhoc"] as const).map((s) => <Chip key={s} active={scope === s} onClick={() => setScope(s)}>{s === "adhoc" ? "Ad-hoc only" : s === "all" ? "All" : "Upcoming"}</Chip>)}
      </div>

      {view === "trips" && (trips && trips.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="No trips yet" hint="Plan a destination, or add ad-hoc flights and trains from the tabs above." action={<Button onClick={() => setAdd(true)}><Plus size={16} /> New trip</Button>} />
      ) : filteredTrips.length === 0 ? (
        <EmptyState icon={<Search />} title="No trips match" hint="Try a city, a month like “nov”, a place name or a flight number." />
      ) : (
        <div className="space-y-2.5">{filteredTrips.map((t) => <TripRow key={t.id} trip={t} />)}</div>
      ))}

      {view === "flights" && (filteredFlights.length === 0 ? (
        <EmptyState icon={<Plane />} title={flights.length ? "No flights match" : "No flights yet"} hint="Add any flight — it doesn't need to belong to a trip. Just the flight number and date." action={<Button onClick={() => setAddFlight(true)}><Plus size={16} /> Add flight</Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{filteredFlights.map((f) => <FlightCard key={f.id} flight={f} showTrip />)}</div>
      ))}

      {view === "trains" && (filteredTrains.length === 0 ? (
        <EmptyState icon={<TrainFront />} title={trains.length ? "No trains match" : "No train journeys yet"} hint="Track intercity trains, rail passes and commuter legs with PNRs and seats." action={<Button onClick={() => setAddTrain(true)}><Plus size={16} /> Add train</Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{filteredTrains.map((t) => <TrainCard key={t.id} train={t} showTrip />)}</div>
      ))}

      {add && <TripForm open onClose={() => setAdd(false)} />}
      {addFlight && <FlightForm open onClose={() => setAddFlight(false)} />}
      {addTrain && <TrainForm open onClose={() => setAddTrain(false)} />}
    </div>
  );
}
