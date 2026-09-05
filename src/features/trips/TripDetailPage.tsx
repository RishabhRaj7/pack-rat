import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, MapPin, CalendarRange, Plane, Wallet, Siren, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { PageHeader, Button, Badge, Avatar, StatusDot, Card } from "@/components/ui";
import { ScrollStrip, SyncBadge } from "@/components/sync";
import { useMemberMap } from "@/features/family/hooks";
import { deleteTripCascade } from "@/lib/repo";
import { fmtDate, daysBetween, today, cn } from "@/lib/utils";
import { useTrip, usePlaces, useHotels, useFlights, useTrains } from "./hooks";
import { placeStatus, tripStatus, type Trip } from "./types";
import { TripForm } from "./TripForm";
import { PlacesTab } from "./PlacesTab";
import { ItineraryTab } from "./ItineraryTab";
import { StayTab } from "./StayTab";
import { ExpensesTab } from "./ExpensesTab";
import { EmergencyTab } from "./EmergencyTab";

const TABS = [
  { id: "places", label: "Places", icon: MapPin },
  { id: "itinerary", label: "Itinerary", icon: CalendarRange },
  { id: "stay", label: "Travel & Stay", icon: Plane },
  { id: "expenses", label: "Expenses", icon: Wallet },
  { id: "emergency", label: "Emergency", icon: Siren },
] as const;
type TabId = (typeof TABS)[number]["id"];

/** Traveller passport / visa checks for this trip (6-month validity rule). */
function TravellerReadiness({ trip }: { trip: Trip }) {
  const members = useMemberMap();
  const docs = useLiveQuery(() => db.documents.where("memberId").anyOf(trip.travellerIds).toArray(), [trip.travellerIds.join()]) ?? [];
  type Warning = { id: string; name: string; msg: string; tone: "warn" | "danger" };
  const warnings = trip.travellerIds.flatMap((id): Warning[] => {
    const m = members.get(id);
    if (!m) return [];
    const passports = docs.filter((d) => d.memberId === id && d.type === "passport");
    if (!passports.length) return [{ id, name: m.name, msg: "no passport on file", tone: "warn" as const }];
    const sixMonthsAfterEnd = new Date(trip.endDate); sixMonthsAfterEnd.setMonth(sixMonthsAfterEnd.getMonth() + 6);
    const best = passports.sort((a, b) => (b.expiryDate ?? "").localeCompare(a.expiryDate ?? ""))[0];
    if (best.expiryDate && new Date(best.expiryDate) < sixMonthsAfterEnd) return [{ id, name: m.name, msg: `passport expires ${fmtDate(best.expiryDate)} — less than 6 months after the trip`, tone: "danger" as const }];
    return [];
  });
  if (!warnings.length) return null;
  return (
    <Card className="mb-4 bg-warn-soft/60 p-3">
      {warnings.map((w) => <p key={w.id} className={cn("flex items-center gap-2 text-sm", w.tone === "danger" ? "text-danger" : "text-warn")}><AlertTriangle size={14} /> <b>{w.name}</b>: {w.msg}. <Link to={`/family/${w.id}`} className="underline">Open profile</Link></p>)}
    </Card>
  );
}

export function TripDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : "places";
  // Replace (not push) so switching tabs doesn't pile up history entries — the browser Back
  // button on desktop should leave the trip, not step through every tab visited. Other params are kept.
  const selectTab = (id: TabId) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === "places") next.delete("tab");
        else next.set("tab", id);
        return next;
      },
      { replace: true }
    );
  const trip = useTrip(id);
  const places = usePlaces(id);
  const hotels = useHotels(id);
  const flights = useFlights(id);
  const trains = useTrains(id);
  const members = useMemberMap();
  const [edit, setEdit] = useState(false);

  if (!trip) return <div className="py-20 text-center text-muted">{trip === undefined ? "Loading…" : "Trip not found"}</div>;
  const status = tripStatus(trip);
  const counts = { action: 0, progress: 0, ready: 0 };
  places.forEach((p) => counts[placeStatus(p)]++);
  const bookingsMissing = [...hotels, ...flights, ...trains].filter((x) => x.status !== "done").length;
  const daysTo = daysBetween(today(), trip.startDate);

  return (
    <div>
      <PageHeader
        back={<Link to="/trips" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg"><ArrowLeft size={14} /> Trips</Link>}
        title={trip.title}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2">{trip.city}, {trip.country} · {fmtDate(trip.startDate, "d MMM")} – {fmtDate(trip.endDate)} · {daysBetween(trip.startDate, trip.endDate) + 1} days <SyncBadge table="trips" id={trip.id} /></span>}
        action={<div className="flex gap-2"><Button variant="outline" size="icon" onClick={() => setEdit(true)}><Pencil size={16} /></Button><Button variant="danger" size="icon" onClick={async () => { if (confirm(`Delete "${trip.title}" and everything in it?`)) { await deleteTripCascade(trip.id); nav("/trips"); } }}><Trash2 size={16} /></Button></div>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={status === "ongoing" ? "ok" : status === "completed" ? "neutral" : "accent"}>{status === "ongoing" ? "Happening now" : status === "completed" ? "Completed" : daysTo === 0 ? "Starts today" : `Starts in ${daysTo} days`}</Badge>
        <span className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-medium shadow-card"><StatusDot status="ready" /> {counts.ready} confirmed <StatusDot status="progress" className="ml-1" /> {counts.progress} in progress <StatusDot status="action" className="ml-1" /> {counts.action} need action</span>
        {bookingsMissing > 0 && <Badge tone="warn">{bookingsMissing} booking{bookingsMissing > 1 && "s"} unconfirmed</Badge>}
        <span className="ml-auto flex -space-x-2">{trip.travellerIds.map((tid) => { const m = members.get(tid); return m ? <Link key={tid} to={`/family/${tid}`} title={m.name}><Avatar name={m.name} size={28} /></Link> : null; })}</span>
      </div>
      <TravellerReadiness trip={trip} />
      {trip.notes && tab === "places" && <Card className="mb-4 whitespace-pre-wrap p-4 text-sm text-muted">{trip.notes}</Card>}

      <ScrollStrip className="mb-5 rounded-full bg-surface-2 p-1" activeKey={tab}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-strip-key={t.id}
            onClick={() => selectTab(t.id)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition sm:text-sm", tab === t.id ? "bg-surface text-accent-strong shadow-card" : "text-muted hover:text-fg")}
          >
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </ScrollStrip>

      <div className="animate-fade-up" key={tab}>
        {tab === "places" && <PlacesTab trip={trip} />}
        {tab === "itinerary" && <ItineraryTab trip={trip} />}
        {tab === "stay" && <StayTab trip={trip} />}
        {tab === "expenses" && <ExpensesTab trip={trip} />}
        {tab === "emergency" && <EmergencyTab trip={trip} />}
      </div>
      {edit && <TripForm open onClose={() => setEdit(false)} trip={trip} />}
    </div>
  );
}
