import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Hotel as HotelIcon, Plane, Navigation, Phone, RefreshCw, ExternalLink, Copy, Check } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Select, Card, Badge, EmptyState, StatusBadge, Avatar } from "@/components/ui";
import { AttachmentList, AttachmentChip } from "@/components/attachments";
import { put, newId, remove, removeAttachment } from "@/lib/repo";
import { mapsUrl, fmtDate, fmtDateTime, fmtTime, daysBetween, copyToClipboard, cn } from "@/lib/utils";
import { fetchFlightStatus, flightTrackerUrl, type FlightLive } from "@/lib/services";
import { useMemberMap, useMembers } from "@/features/family/hooks";
import { useHotels, useFlights } from "./hooks";
import type { Hotel, Flight, Trip, ReqState, ReadyStatus } from "./types";

const reqToReady = (s: ReqState): ReadyStatus => (s === "missing" ? "action" : s === "pending" ? "progress" : "ready");

function BookingStatusSelect({ value, onChange }: { value: ReqState; onChange: (v: ReqState) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ReqState)}>
      <option value="missing">🔴 Not booked</option>
      <option value="pending">🟠 Awaiting confirmation</option>
      <option value="done">🟢 Confirmed</option>
    </Select>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={async () => { if (await copyToClipboard(text)) { setOk(true); setTimeout(() => setOk(false), 1500); } }} className="rounded p-1 text-muted hover:text-accent" title="Copy">
      {ok ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
    </button>
  );
}

/* ---------------- Hotels ---------------- */
function HotelForm({ open, onClose, trip, hotel }: { open: boolean; onClose: () => void; trip: Trip; hotel?: Hotel }) {
  const [form, setForm] = useState<Partial<Hotel>>(hotel ?? { tripId: trip.id, name: "", address: "", checkIn: trip.startDate, checkOut: trip.endDate, checkInTime: "15:00", checkOutTime: "11:00", status: "missing", attachmentIds: [] });
  const set = (k: keyof Hotel, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.name?.trim() && form.checkIn && form.checkOut;
  return (
    <Modal open={open} onClose={onClose} title={hotel ? "Edit stay" : "Add hotel / stay"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={async () => { await put("hotels", { ...(form as Hotel), id: form.id ?? newId(), attachmentIds: form.attachmentIds ?? [] }); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Property name"><Input autoFocus value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Marina Bay Sands" /></Field>
        <Field label="Address"><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="10 Bayfront Ave, Singapore 018956" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Check-in"><Input type="date" value={form.checkIn ?? ""} onChange={(e) => set("checkIn", e.target.value)} /></Field>
          <Field label="Check-out"><Input type="date" value={form.checkOut ?? ""} onChange={(e) => set("checkOut", e.target.value)} /></Field>
          <Field label="Check-in time"><Input type="time" value={form.checkInTime ?? ""} onChange={(e) => set("checkInTime", e.target.value)} /></Field>
          <Field label="Check-out time"><Input type="time" value={form.checkOutTime ?? ""} onChange={(e) => set("checkOutTime", e.target.value)} /></Field>
          <Field label="Confirmation #"><Input value={form.confirmation ?? ""} onChange={(e) => set("confirmation", e.target.value)} className="font-mono" /></Field>
          <Field label="Room type"><Input value={form.roomType ?? ""} onChange={(e) => set("roomType", e.target.value)} placeholder="Deluxe twin, high floor" /></Field>
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Booking status"><BookingStatusSelect value={form.status ?? "missing"} onChange={(v) => set("status", v)} /></Field>
        </div>
        <Field label="Confirmation documents"><AttachmentList ids={form.attachmentIds ?? []} onChange={(ids) => set("attachmentIds", ids)} label="Attach confirmation" /></Field>
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Breakfast included? Late check-out requested?" /></Field>
      </div>
    </Modal>
  );
}

function HotelCard({ hotel, trip }: { hotel: Hotel; trip: Trip }) {
  const [edit, setEdit] = useState(false);
  const nights = daysBetween(hotel.checkIn, hotel.checkOut);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{hotel.name}</h3>
            <StatusBadge status={reqToReady(hotel.status)} />
          </div>
          <a href={mapsUrl({ name: hotel.name, address: hotel.address })} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-accent hover:underline"><Navigation size={11} /> {hotel.address || "Open in Maps"}</a>
        </div>
        <div className="flex shrink-0">
          <button onClick={() => setEdit(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={14} /></button>
          <button onClick={async () => { if (confirm("Remove this stay?")) { await Promise.all(hotel.attachmentIds.map(removeAttachment)); await remove("hotels", hotel.id); } }} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-surface-2 p-3 text-sm sm:grid-cols-4">
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Check-in</p><p className="font-semibold">{fmtDate(hotel.checkIn, "EEE d MMM")}</p><p className="text-xs text-muted">{hotel.checkInTime}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Check-out</p><p className="font-semibold">{fmtDate(hotel.checkOut, "EEE d MMM")}</p><p className="text-xs text-muted">{hotel.checkOutTime}</p></div>
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Nights</p><p className="font-semibold">{nights}</p>{hotel.roomType && <p className="text-xs text-muted">{hotel.roomType}</p>}</div>
        <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Confirmation</p><p className="flex items-center gap-1 font-mono text-xs font-semibold">{hotel.confirmation || "—"}{hotel.confirmation && <CopyBtn text={hotel.confirmation} />}</p>{hotel.phone && <a href={`tel:${hotel.phone}`} className="flex items-center gap-1 text-xs text-accent"><Phone size={10} /> {hotel.phone}</a>}</div>
      </div>
      {hotel.notes && <p className="mt-2 text-sm text-muted">{hotel.notes}</p>}
      {hotel.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{hotel.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
      {edit && <HotelForm open onClose={() => setEdit(false)} trip={trip} hotel={hotel} />}
    </Card>
  );
}

/* ---------------- Flights ---------------- */
function FlightForm({ open, onClose, trip, flight }: { open: boolean; onClose: () => void; trip: Trip; flight?: Flight }) {
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<Flight>>(flight ?? { tripId: trip.id, airline: "", flightNumber: "", from: "", to: "", departAt: `${trip.startDate}T00:00`, arriveAt: `${trip.startDate}T00:00`, passengerIds: trip.travellerIds, status: "missing", attachmentIds: [] });
  const set = (k: keyof Flight, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.flightNumber?.trim() && form.from && form.to && form.departAt && form.arriveAt;
  return (
    <Modal open={open} onClose={onClose} title={flight ? "Edit flight" : "Add flight"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={async () => { await put("flights", { ...(form as Flight), id: form.id ?? newId(), flightNumber: form.flightNumber!.toUpperCase().replace(/\s+/g, ""), from: form.from!.toUpperCase(), to: form.to!.toUpperCase(), passengerIds: form.passengerIds ?? [], attachmentIds: form.attachmentIds ?? [] }); onClose(); }}>Save</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Airline"><Input autoFocus value={form.airline ?? ""} onChange={(e) => set("airline", e.target.value)} placeholder="Singapore Airlines" /></Field>
          <Field label="Flight number"><Input value={form.flightNumber ?? ""} onChange={(e) => set("flightNumber", e.target.value)} placeholder="SQ423" className="uppercase" /></Field>
          <Field label="From (IATA)"><Input value={form.from ?? ""} onChange={(e) => set("from", e.target.value)} placeholder="BOM" maxLength={3} className="uppercase" /></Field>
          <Field label="To (IATA)"><Input value={form.to ?? ""} onChange={(e) => set("to", e.target.value)} placeholder="SIN" maxLength={3} className="uppercase" /></Field>
          <Field label="Departure date"><Input type="date" value={form.departAt?.slice(0, 10) ?? ""} onChange={(e) => set("departAt", `${e.target.value}T00:00`)} /></Field>
          <Field label="Arrival date"><Input type="date" value={form.arriveAt?.slice(0, 10) ?? ""} onChange={(e) => set("arriveAt", `${e.target.value}T00:00`)} /></Field>
          <Field label="Terminal"><Input value={form.terminal ?? ""} onChange={(e) => set("terminal", e.target.value)} /></Field>
          <Field label="Seats"><Input value={form.seats ?? ""} onChange={(e) => set("seats", e.target.value)} placeholder="34A, 34B" /></Field>
          <Field label="PNR / confirmation"><Input value={form.confirmation ?? ""} onChange={(e) => set("confirmation", e.target.value)} className="font-mono uppercase" /></Field>
          <Field label="Booking status"><BookingStatusSelect value={form.status ?? "missing"} onChange={(v) => set("status", v)} /></Field>
        </div>
        {members.length > 0 && (
          <Field label="Passengers">
            <div className="flex flex-wrap gap-2">
              {members.map((m) => { const on = form.passengerIds?.includes(m.id); return <button key={m.id} type="button" onClick={() => set("passengerIds", on ? form.passengerIds!.filter((x) => x !== m.id) : [...(form.passengerIds ?? []), m.id])} className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-semibold", on ? "border-accent bg-accent-soft" : "border-line text-muted")}><Avatar name={m.name} size={20} /> {m.name}</button>; })}
            </div>
          </Field>
        )}
        <Field label="E-tickets / boarding passes"><AttachmentList ids={form.attachmentIds ?? []} onChange={(ids) => set("attachmentIds", ids)} label="Attach e-ticket" /></Field>
      </div>
    </Modal>
  );
}

const LIVE_META: Record<FlightLive["status"], { label: string; tone: "ok" | "warn" | "danger" | "neutral" | "accent" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  boarding: { label: "Boarding soon", tone: "warn" },
  departed: { label: "In the air", tone: "accent" },
  landed: { label: "Landed", tone: "ok" },
  delayed: { label: "Delayed", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
};

function FlightTime({ manual, scheduled, actual, align = "left" }: { manual: string; scheduled?: string; actual?: string; align?: "left" | "right" }) {
  const planned = scheduled ?? manual;
  const actualDiffers = actual && (!planned || Math.abs(new Date(actual).getTime() - new Date(planned).getTime()) >= 60_000);
  const display = actual && !actualDiffers ? actual : planned;
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <p className={cn("text-xs", actualDiffers ? "text-muted line-through" : "text-muted")}>{fmtDateTime(display)}</p>
      {actualDiffers && <p className="text-xs text-warn">{fmtDateTime(actual)}</p>}
    </div>
  );
}

function FlightCard({ flight, trip }: { flight: Flight; trip: Trip }) {
  const [edit, setEdit] = useState(false);
  const [live, setLive] = useState<FlightLive | null>(null);
  const [loading, setLoading] = useState(false);
  const members = useMemberMap();
  const refresh = async () => { setLoading(true); setLive(await fetchFlightStatus(flight)); setLoading(false); };
  useEffect(() => { void refresh(); const t = setInterval(refresh, 5 * 60_000); return () => clearInterval(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [flight.id, flight.departAt]);
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-strong"><Plane size={18} /></div>
          <div>
            <p className="font-bold">{flight.airline} <span className="font-mono text-muted">{flight.flightNumber}</span></p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <StatusBadge status={reqToReady(flight.status)} />
              {live && <Badge tone={LIVE_META[live.status].tone}>{live.source === "estimated" ? "Est. " : "Live · "}{LIVE_META[live.status].label}</Badge>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0">
          <button onClick={refresh} className={cn("rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg", loading && "animate-spin")} title="Refresh status"><RefreshCw size={14} /></button>
          <a href={flightTrackerUrl(flight.flightNumber)} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Track on Flightradar24"><ExternalLink size={14} /></a>
          <button onClick={() => setEdit(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={14} /></button>
          <button onClick={async () => { if (confirm("Remove flight?")) { await Promise.all(flight.attachmentIds.map(removeAttachment)); await remove("flights", flight.id); } }} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface-2 p-3">
        <div className="flex-1"><p className="text-2xl font-extrabold tracking-tight">{flight.from}</p><FlightTime manual={flight.departAt} scheduled={live?.scheduledDepart} actual={live?.actualDepart} />{live?.gate && <p className="text-xs text-warn">Gate {live.gate}</p>}</div>
        <div className="flex flex-col items-center text-muted"><span className="text-[10px]">{flight.terminal ? `T${flight.terminal.replace(/^T/i, "")}` : ""}</span><div className="flex items-center gap-1"><span className="h-px w-8 bg-line" /><Plane size={14} /><span className="h-px w-8 bg-line" /></div>{flight.seats && <span className="text-[10px]">Seats {flight.seats}</span>}</div>
        <div className="flex-1 text-right"><p className="text-2xl font-extrabold tracking-tight">{flight.to}</p><FlightTime manual={flight.arriveAt} scheduled={live?.scheduledArrive} actual={live?.actualArrive} align="right" /></div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1">PNR <span className="font-mono font-semibold text-fg">{flight.confirmation || "—"}</span>{flight.confirmation && <CopyBtn text={flight.confirmation} />}</span>
        <span className="flex -space-x-1.5">{flight.passengerIds.map((id) => { const m = members.get(id); return m ? <Avatar key={id} name={m.name} size={20} /> : null; })}</span>
      </div>
      {flight.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{flight.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
      {live?.source === "estimated" && <p className="mt-2 text-[11px] text-muted">Status estimated from schedule. Add <code>VITE_AERODATABOX_KEY</code> for live airline data.</p>}
      {edit && <FlightForm open onClose={() => setEdit(false)} trip={trip} flight={flight} />}
    </Card>
  );
}

export function StayTab({ trip }: { trip: Trip }) {
  const hotels = useHotels(trip.id);
  const flights = useFlights(trip.id);
  const [addHotel, setAddHotel] = useState(false);
  const [addFlight, setAddFlight] = useState(false);
  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><Plane size={18} className="text-accent" /> Flights</h2><Button size="sm" onClick={() => setAddFlight(true)}><Plus size={14} /> Add flight</Button></div>
        {flights.length === 0 ? <EmptyState icon={<Plane />} title="No flights added" hint="Add your outbound and return flights to track their status." /> : <div className="grid gap-3 lg:grid-cols-2">{flights.map((f) => <FlightCard key={f.id} flight={f} trip={trip} />)}</div>}
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-bold"><HotelIcon size={18} className="text-accent" /> Stay</h2><Button size="sm" onClick={() => setAddHotel(true)}><Plus size={14} /> Add stay</Button></div>
        {hotels.length === 0 ? <EmptyState icon={<HotelIcon />} title="No hotel yet" hint="Add your reservation — check-in/out, confirmation number, address." /> : <div className="space-y-3">{hotels.map((h) => <HotelCard key={h.id} hotel={h} trip={trip} />)}</div>}
      </section>
      {addHotel && <HotelForm open onClose={() => setAddHotel(false)} trip={trip} />}
      {addFlight && <FlightForm open onClose={() => setAddFlight(false)} trip={trip} />}
    </div>
  );
}
