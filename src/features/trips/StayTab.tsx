import { useState } from "react";
import { Plus, Pencil, Trash2, Hotel as HotelIcon, Plane, TrainFront, Navigation, Phone } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Card, EmptyState, StatusBadge } from "@/components/ui";
import { AttachmentList, AttachmentChip } from "@/components/attachments";
import { put, newId, remove, removeAttachment } from "@/lib/repo";
import { mapsUrl, fmtDate, daysBetween } from "@/lib/utils";
import { useHotels, useFlights, useTrains } from "./hooks";
import type { Hotel, Trip } from "./types";
import { BookingStatusSelect, CopyBtn, reqToReady, IconBtn } from "@/features/journeys/common";
import { FlightCard, FlightForm } from "@/features/journeys/FlightCard";
import { TrainCard, TrainForm } from "@/features/journeys/TrainCard";

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
            <h3 className="font-semibold">{hotel.name}</h3>
            <StatusBadge status={reqToReady(hotel.status)} />
          </div>
          <a href={mapsUrl({ name: hotel.name, address: hotel.address })} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-accent hover:underline"><Navigation size={11} /> {hotel.address || "Open in Maps"}</a>
        </div>
        <div className="flex shrink-0">
          <IconBtn onClick={() => setEdit(true)} title="Edit"><Pencil size={15} /></IconBtn>
          <IconBtn danger title="Remove" onClick={async () => { if (confirm("Remove this stay?")) { await Promise.all(hotel.attachmentIds.map(removeAttachment)); await remove("hotels", hotel.id); } }}><Trash2 size={15} /></IconBtn>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-surface-2 p-3 text-sm sm:grid-cols-4">
        <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted">Check-in</p><p className="font-semibold">{fmtDate(hotel.checkIn, "EEE d MMM")}</p><p className="text-xs text-muted">{hotel.checkInTime}</p></div>
        <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted">Check-out</p><p className="font-semibold">{fmtDate(hotel.checkOut, "EEE d MMM")}</p><p className="text-xs text-muted">{hotel.checkOutTime}</p></div>
        <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted">Nights</p><p className="font-semibold">{nights}</p>{hotel.roomType && <p className="text-xs text-muted">{hotel.roomType}</p>}</div>
        <div><p className="text-[10px] font-medium uppercase tracking-wide text-muted">Confirmation</p><p className="flex items-center gap-1 font-mono text-xs font-semibold">{hotel.confirmation || "—"}{hotel.confirmation && <CopyBtn text={hotel.confirmation} />}</p>{hotel.phone && <a href={`tel:${hotel.phone}`} className="flex items-center gap-1 text-xs text-accent"><Phone size={10} /> {hotel.phone}</a>}</div>
      </div>
      {hotel.notes && <p className="mt-2 text-sm text-muted">{hotel.notes}</p>}
      {hotel.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{hotel.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
      {edit && <HotelForm open onClose={() => setEdit(false)} trip={trip} hotel={hotel} />}
    </Card>
  );
}

function SectionHead({ icon: I, title, count, onAdd, addLabel }: { icon: typeof Plane; title: string; count: number; onAdd: () => void; addLabel: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base font-semibold"><I size={18} className="text-accent" /> {title}{count > 0 && <span className="text-sm font-normal text-muted">{count}</span>}</h2>
      <Button size="sm" variant="secondary" onClick={onAdd}><Plus size={14} /> {addLabel}</Button>
    </div>
  );
}

export function StayTab({ trip }: { trip: Trip }) {
  const hotels = useHotels(trip.id);
  const flights = useFlights(trip.id);
  const trains = useTrains(trip.id);
  const [addHotel, setAddHotel] = useState(false);
  const [addFlight, setAddFlight] = useState(false);
  const [addTrain, setAddTrain] = useState(false);
  return (
    <div className="space-y-8">
      <section>
        <SectionHead icon={Plane} title="Flights" count={flights.length} onAdd={() => setAddFlight(true)} addLabel="Flight" />
        {flights.length === 0 ? <EmptyState icon={<Plane />} title="No flights yet" hint="Just the flight number and date — airline, logo and route are looked up for you." action={<Button size="sm" onClick={() => setAddFlight(true)}><Plus size={14} /> Add flight</Button>} /> : <div className="grid gap-3 lg:grid-cols-2">{flights.map((f) => <FlightCard key={f.id} flight={f} />)}</div>}
      </section>
      <section>
        <SectionHead icon={TrainFront} title="Trains" count={trains.length} onAdd={() => setAddTrain(true)} addLabel="Train" />
        {trains.length === 0 ? <EmptyState icon={<TrainFront />} title="No train journeys" hint="Rail legs, intercity trains, airport express — keep PNRs and seats here." /> : <div className="grid gap-3 lg:grid-cols-2">{trains.map((t) => <TrainCard key={t.id} train={t} />)}</div>}
      </section>
      <section>
        <SectionHead icon={HotelIcon} title="Stay" count={hotels.length} onAdd={() => setAddHotel(true)} addLabel="Stay" />
        {hotels.length === 0 ? <EmptyState icon={<HotelIcon />} title="No hotel yet" hint="Add your reservation — check-in/out, confirmation number, address." /> : <div className="space-y-3">{hotels.map((h) => <HotelCard key={h.id} hotel={h} trip={trip} />)}</div>}
      </section>
      {addHotel && <HotelForm open onClose={() => setAddHotel(false)} trip={trip} />}
      {addFlight && <FlightForm open onClose={() => setAddFlight(false)} trip={trip} />}
      {addTrain && <TrainForm open onClose={() => setAddTrain(false)} trip={trip} />}
    </div>
  );
}
