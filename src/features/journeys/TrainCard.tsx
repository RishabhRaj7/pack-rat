import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TrainFront, Pencil, Trash2, ExternalLink, ChevronDown } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Card, Badge, StatusBadge, Avatar } from "@/components/ui";
import { AttachmentList, AttachmentChip } from "@/components/attachments";
import { put, newId, remove, removeAttachment } from "@/lib/repo";
import { fmtDate, fmtTime, cn, today } from "@/lib/utils";
import { guessTrainOperator } from "@/lib/services";
import { useMemberMap } from "@/features/family/hooks";
import { useTrip } from "@/features/trips/hooks";
import { NO_TRIP, type Train, type Trip } from "@/features/trips/types";
import { BookingStatusSelect, CopyBtn, PassengerPicker, TripPicker, reqToReady, splitDT, joinDT, IconBtn } from "./common";

export function TrainForm({ open, onClose, trip, train, tripId }: { open: boolean; onClose: () => void; trip?: Trip; train?: Train; tripId?: string }) {
  const [form, setForm] = useState<Partial<Train>>(
    train ?? { tripId: trip?.id ?? tripId ?? NO_TRIP, trainNumber: "", from: "", to: "", departAt: trip ? `${trip.startDate}T00:00` : "", passengerIds: trip?.travellerIds ?? [], status: "missing", attachmentIds: [] }
  );
  const [more, setMore] = useState(!!train);
  const set = (k: keyof Train, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const dep = splitDT(form.departAt);
  const arr = splitDT(form.arriveAt);
  const valid = !!form.trainNumber?.trim() && !!dep.date;
  const guess = guessTrainOperator(form.trainNumber ?? "");

  // Auto-fill operator when recognisable and the user hasn't typed one.
  useEffect(() => {
    if (guess.operator && !form.operator) set("operator", guess.operator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guess.operator]);

  const save = async () => {
    if (!valid) return;
    await put("trains", {
      ...(form as Train),
      id: form.id ?? newId(),
      tripId: form.tripId ?? NO_TRIP,
      trainNumber: form.trainNumber!.trim().toUpperCase(),
      from: form.from ?? "",
      to: form.to ?? "",
      departAt: joinDT(dep.date, dep.time),
      arriveAt: arr.date || arr.time ? joinDT(arr.date || dep.date, arr.time) : undefined,
      passengerIds: form.passengerIds ?? [],
      attachmentIds: form.attachmentIds ?? [],
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={train ? "Edit train" : "Add train"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Train number / name"><Input autoFocus value={form.trainNumber ?? ""} onChange={(e) => set("trainNumber", e.target.value)} placeholder="12951 · ICE 599 · Nozomi 23" className="bg-surface" /></Field>
            <Field label="Departure date"><Input type="date" value={dep.date} onChange={(e) => set("departAt", joinDT(e.target.value, dep.time))} className="bg-surface" /></Field>
          </div>
          <p className="mt-2.5 text-xs text-muted">{guess.operator ? `Recognised as ${guess.operator}.` : "Train schedules have no open global API, so stations and times are entered by hand — the operator is detected from the number format where possible."}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From station"><Input value={form.from ?? ""} onChange={(e) => set("from", e.target.value)} placeholder="Mumbai Central" /></Field>
          <Field label="To station"><Input value={form.to ?? ""} onChange={(e) => set("to", e.target.value)} placeholder="New Delhi" /></Field>
          <Field label="Departure time"><Input type="time" value={dep.time} onChange={(e) => set("departAt", joinDT(dep.date, e.target.value))} /></Field>
          <Field label="Arrival time"><Input type="time" value={arr.time} onChange={(e) => set("arriveAt", joinDT(arr.date || dep.date, e.target.value))} /></Field>
        </div>
        <Field label="Who's travelling" hint="Tag one or more family members — used to filter Home by person."><PassengerPicker value={form.passengerIds ?? []} onChange={(ids) => set("passengerIds", ids)} /></Field>
        <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm font-medium text-accent">
          <span>{more ? "Hide" : "More"} details</span> <ChevronDown size={16} className={cn("transition", more && "rotate-180")} />
        </button>
        {more && (
          <div className="space-y-4 animate-fade-up">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Arrival date"><Input type="date" value={arr.date} onChange={(e) => set("arriveAt", joinDT(e.target.value, arr.time))} /></Field>
              <Field label="Operator"><Input value={form.operator ?? ""} onChange={(e) => set("operator", e.target.value)} placeholder="Indian Railways" /></Field>
              <Field label="Train name"><Input value={form.trainName ?? ""} onChange={(e) => set("trainName", e.target.value)} placeholder="Mumbai Rajdhani" /></Field>
              <Field label="Class"><Input value={form.travelClass ?? ""} onChange={(e) => set("travelClass", e.target.value)} placeholder="3A · 2nd · Green" /></Field>
              <Field label="Coach"><Input value={form.coach ?? ""} onChange={(e) => set("coach", e.target.value)} placeholder="B4" /></Field>
              <Field label="Seats / berths"><Input value={form.seats ?? ""} onChange={(e) => set("seats", e.target.value)} placeholder="21, 22" /></Field>
              <Field label="PNR / booking ref"><Input value={form.pnr ?? ""} onChange={(e) => set("pnr", e.target.value)} className="font-mono uppercase" /></Field>
              <Field label="Booking status"><BookingStatusSelect value={form.status ?? "missing"} onChange={(v) => set("status", v)} /></Field>
            </div>
            {!trip && <Field label="Trip"><TripPicker value={form.tripId ?? NO_TRIP} onChange={(v) => set("tripId", v)} /></Field>}
            <Field label="Tickets"><AttachmentList ids={form.attachmentIds ?? []} onChange={(ids) => set("attachmentIds", ids)} label="Attach ticket" /></Field>
            <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Platform usually announced 20 min before; food not included…" /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

export function TrainCard({ train, showTrip, compact }: { train: Train; showTrip?: boolean; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const members = useMemberMap();
  const trip = useTrip(showTrip && train.tripId ? train.tripId : undefined);
  const guess = guessTrainOperator(train.trainNumber);
  const past = train.departAt.slice(0, 10) < today();
  return (
    <Card className={cn("p-4", past && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong"><TrainFront size={20} /></div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{train.trainName || train.operator || "Train"}</p>
            <p className="font-mono text-xs text-muted">{train.trainNumber}{train.travelClass && ` · ${train.travelClass}`}{train.coach && ` · ${train.coach}`}{train.seats && ` · ${train.seats}`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {guess.statusUrl && <IconBtn href={guess.statusUrl} title="Live status"><ExternalLink size={15} /></IconBtn>}
          <IconBtn onClick={() => setEdit(true)} title="Edit"><Pencil size={15} /></IconBtn>
          <IconBtn danger title="Remove" onClick={async () => { if (confirm("Remove train?")) { await Promise.all(train.attachmentIds.map(removeAttachment)); await remove("trains", train.id); } }}><Trash2 size={15} /></IconBtn>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{train.from || "—"}</p>
          <p className="text-sm font-medium">{fmtTime(train.departAt)}</p>
          <p className="text-[11px] text-muted">{fmtDate(train.departAt.slice(0, 10), "EEE d MMM")}</p>
        </div>
        <div className="flex items-center gap-1 text-muted"><span className="h-px w-6 bg-line sm:w-10" /><TrainFront size={14} /><span className="h-px w-6 bg-line sm:w-10" /></div>
        <div className="min-w-0 flex-1 text-right">
          <p className="truncate text-base font-semibold">{train.to || "—"}</p>
          {train.arriveAt ? <><p className="text-sm font-medium">{fmtTime(train.arriveAt)}</p><p className="text-[11px] text-muted">{fmtDate(train.arriveAt.slice(0, 10), "EEE d MMM")}</p></> : <p className="text-[11px] text-muted">Arrival —</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusBadge status={reqToReady(train.status)} />
        {train.operator && <Badge>{train.operator}</Badge>}
        {trip && <Link to={`/trips/${trip.id}?tab=stay`}><Badge tone="accent">{trip.title}</Badge></Link>}
        {showTrip && !train.tripId && <Badge>Ad-hoc</Badge>}
        {train.pnr && <span className="ml-auto flex items-center gap-1">PNR <span className="font-mono font-semibold text-fg">{train.pnr}</span><CopyBtn text={train.pnr} /></span>}
        <span className={cn("flex -space-x-1.5", !train.pnr && "ml-auto")}>{train.passengerIds.map((id) => { const m = members.get(id); return m ? <Avatar key={id} name={m.name} size={20} /> : null; })}</span>
      </div>
      {!compact && train.notes && <p className="mt-2 text-sm text-muted">{train.notes}</p>}
      {!compact && train.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{train.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
      {edit && <TrainForm open onClose={() => setEdit(false)} train={train} />}
    </Card>
  );
}
