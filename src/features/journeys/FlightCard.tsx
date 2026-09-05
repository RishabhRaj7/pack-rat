import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plane, Pencil, Trash2, RefreshCw, ExternalLink, ChevronDown, Search, Loader2, History as HistoryIcon } from "lucide-react";
import { Modal, Button, Field, Input, Card, Badge, StatusBadge, Avatar } from "@/components/ui";
import { AttachmentList, AttachmentChip } from "@/components/attachments";
import { put, newId, remove, removeAttachment } from "@/lib/repo";
import { fmtDate, fmtTime, cn, today } from "@/lib/utils";
import { fetchFlightStatus, fetchFlightHistory, flightTrackerUrl, lookupFlightRoute, airlineLogoUrl, parseFlightNumber, minutesDiff, hasFlightDataKey, type FlightLive, type FlightHistory } from "@/lib/services";
import { useMemberMap } from "@/features/family/hooks";
import { useTrip } from "@/features/trips/hooks";
import { NO_TRIP, type Flight, type Trip } from "@/features/trips/types";
import { BookingStatusSelect, CopyBtn, PassengerPicker, TripPicker, reqToReady, splitDT, joinDT, IconBtn } from "./common";

/* ---------------- Airline logo ---------------- */
export function AirlineLogo({ code, size = 40, className }: { code?: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const url = airlineLogoUrl(code);
  useEffect(() => setBroken(false), [code]);
  if (!url || broken)
    return (
      <div style={{ width: size, height: size }} className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-strong", className)}>
        <Plane size={Math.round(size * 0.45)} />
      </div>
    );
  return (
    <div style={{ width: size, height: size }} className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1.5 ring-1 ring-line", className)}>
      <img src={url} alt={code} className="h-full w-full object-contain" onError={() => setBroken(true)} loading="lazy" />
    </div>
  );
}

/* ---------------- Form ---------------- */
export function FlightForm({ open, onClose, trip, flight, tripId }: { open: boolean; onClose: () => void; trip?: Trip; flight?: Flight; tripId?: string }) {
  const initialTrip = flight?.tripId ?? trip?.id ?? tripId ?? NO_TRIP;
  const [form, setForm] = useState<Partial<Flight>>(
    flight ?? { tripId: initialTrip, airline: "", flightNumber: "", from: "", to: "", departAt: trip ? `${trip.startDate}T00:00` : "", arriveAt: "", passengerIds: trip?.travellerIds ?? [], status: "missing", attachmentIds: [] }
  );
  const [more, setMore] = useState(!!flight);
  const [looking, setLooking] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const lastLooked = useRef<string>(flight?.flightNumber ?? "");
  const set = (k: keyof Flight, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const dep = splitDT(form.departAt);
  const arr = splitDT(form.arriveAt);
  const parsed = parseFlightNumber(form.flightNumber ?? "");
  const valid = !!parsed && !!dep.date;

  /** Resolve airline + route from the flight number (debounced while typing). */
  const lookup = async (force = false) => {
    const p = parseFlightNumber(form.flightNumber ?? "");
    if (!p || (!force && p.normalized === lastLooked.current)) return;
    lastLooked.current = p.normalized;
    setLooking(true);
    setLookupMsg(null);
    const info = await lookupFlightRoute(p.normalized);
    setLooking(false);
    if (!info) return;
    setForm((f) => ({
      ...f,
      airlineCode: info.airlineCode ?? f.airlineCode,
      airline: info.airlineName ?? f.airline,
      from: force || !f.from ? (info.from ?? f.from ?? "") : f.from,
      to: force || !f.to ? (info.to ?? f.to ?? "") : f.to,
      fromName: info.fromCity ?? info.fromName ?? f.fromName,
      toName: info.toCity ?? info.toName ?? f.toName,
    }));
    setLookupMsg(info.from && info.to ? `${info.airlineName ?? p.code} · ${info.from} → ${info.to}` : info.airlineName ? `${info.airlineName} — route not found, enter airports below` : "Airline not recognised — fill details manually");
  };
  useEffect(() => {
    const t = setTimeout(() => void lookup(), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.flightNumber]);

  const save = async () => {
    if (!valid) return;
    const arriveAt = form.arriveAt && arr.date ? form.arriveAt : joinDT(dep.date, arr.time || dep.time);
    await put("flights", {
      ...(form as Flight),
      id: form.id ?? newId(),
      tripId: form.tripId ?? NO_TRIP,
      flightNumber: parsed!.normalized,
      airlineCode: form.airlineCode ?? (parsed!.code.length === 2 ? parsed!.code : undefined),
      airline: form.airline || parsed!.code,
      from: (form.from ?? "").toUpperCase(),
      to: (form.to ?? "").toUpperCase(),
      departAt: joinDT(dep.date, dep.time),
      arriveAt,
      passengerIds: form.passengerIds ?? [],
      attachmentIds: form.attachmentIds ?? [],
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={flight ? "Edit flight" : "Add flight"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {/* Primary: flight number + date. Everything else is resolved or optional. */}
        <div className="rounded-2xl bg-surface-2 p-4">
          <div className="flex items-start gap-3">
            <AirlineLogo code={form.airlineCode ?? (parsed?.code.length === 2 ? parsed.code : undefined)} size={48} />
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Flight number">
                <div className="relative">
                  <Input autoFocus value={form.flightNumber ?? ""} onChange={(e) => set("flightNumber", e.target.value)} onBlur={() => void lookup()} placeholder="SQ423" className="bg-surface pr-9 font-mono uppercase" />
                  <button type="button" onClick={() => void lookup(true)} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-accent" title="Look up airline & route">
                    {looking ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                  </button>
                </div>
              </Field>
              <Field label="Departure date"><Input type="date" value={dep.date} onChange={(e) => set("departAt", joinDT(e.target.value, dep.time))} className="bg-surface" /></Field>
            </div>
          </div>
          <p className="mt-2.5 min-h-[1rem] text-xs text-muted">{looking ? "Looking up airline and route…" : lookupMsg ?? (form.airline ? `${form.airline}${form.from && form.to ? ` · ${form.from} → ${form.to}` : ""}` : "Airline, logo and route are filled in automatically from the flight number.")}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From" hint={form.fromName}><Input value={form.from ?? ""} onChange={(e) => set("from", e.target.value.toUpperCase())} placeholder="BOM" maxLength={3} className="font-mono uppercase" /></Field>
          <Field label="To" hint={form.toName}><Input value={form.to ?? ""} onChange={(e) => set("to", e.target.value.toUpperCase())} placeholder="SIN" maxLength={3} className="font-mono uppercase" /></Field>
          <Field label="Departure time"><Input type="time" value={dep.time} onChange={(e) => set("departAt", joinDT(dep.date, e.target.value))} /></Field>
          <Field label="Arrival time"><Input type="time" value={arr.time} onChange={(e) => set("arriveAt", joinDT(arr.date || dep.date, e.target.value))} /></Field>
        </div>

        <Field label="Who's flying" hint="Tag one or more family members — used to filter Home by person."><PassengerPicker value={form.passengerIds ?? []} onChange={(ids) => set("passengerIds", ids)} /></Field>

        <button type="button" onClick={() => setMore((m) => !m)} className="flex w-full items-center justify-between rounded-xl px-1 py-1 text-sm font-medium text-accent">
          <span>{more ? "Hide" : "More"} details</span> <ChevronDown size={16} className={cn("transition", more && "rotate-180")} />
        </button>

        {more && (
          <div className="space-y-4 animate-fade-up">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Arrival date"><Input type="date" value={arr.date} onChange={(e) => set("arriveAt", joinDT(e.target.value, arr.time))} /></Field>
              <Field label="Airline"><Input value={form.airline ?? ""} onChange={(e) => set("airline", e.target.value)} placeholder="Singapore Airlines" /></Field>
              <Field label="Terminal"><Input value={form.terminal ?? ""} onChange={(e) => set("terminal", e.target.value)} placeholder="T2" /></Field>
              <Field label="Seats"><Input value={form.seats ?? ""} onChange={(e) => set("seats", e.target.value)} placeholder="34A, 34B" /></Field>
              <Field label="PNR / confirmation"><Input value={form.confirmation ?? ""} onChange={(e) => set("confirmation", e.target.value)} className="font-mono uppercase" /></Field>
              <Field label="Booking status"><BookingStatusSelect value={form.status ?? "missing"} onChange={(v) => set("status", v)} /></Field>
            </div>
            {!trip && <Field label="Trip"><TripPicker value={form.tripId ?? NO_TRIP} onChange={(v) => set("tripId", v)} /></Field>}
            <Field label="E-tickets / boarding passes"><AttachmentList ids={form.attachmentIds ?? []} onChange={(ids) => set("attachmentIds", ids)} label="Attach e-ticket" /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Card ---------------- */
const LIVE_META: Record<FlightLive["status"], { label: string; tone: "neutral" | "ok" | "warn" | "danger" | "accent" }> = {
  scheduled: { label: "Scheduled", tone: "neutral" },
  boarding: { label: "Boarding", tone: "accent" },
  departed: { label: "In the air", tone: "accent" },
  landed: { label: "Landed", tone: "ok" },
  delayed: { label: "Delayed", tone: "warn" },
  cancelled: { label: "Cancelled", tone: "danger" },
  unknown: { label: "Unknown", tone: "neutral" },
};

/** Colour for a deviation from schedule: early → green, a little late → orange, very late → red. */
const deltaTone = (mins: number) => (mins < 0 ? "text-ok" : mins >= 30 ? "text-danger" : "text-warn");
const fmtDelta = (mins: number) => (mins === 0 ? "on time" : `${mins < 0 ? "−" : "+"}${Math.abs(mins) >= 60 ? `${Math.floor(Math.abs(mins) / 60)}h ${Math.abs(mins) % 60 ? `${Math.abs(mins) % 60}m` : ""}`.trim() : `${Math.abs(mins)}m`}`);

/**
 * Scheduled vs. actual time. When the actual (or airline-revised) time differs from the schedule the
 * original is struck through and the new time is shown in green (early) or orange / red (late).
 */
function TimeBlock({ manual, scheduled, actual, isEstimate, align = "left" }: { manual: string; scheduled?: string; actual?: string; isEstimate?: boolean; align?: "left" | "right" }) {
  const sched = scheduled ?? manual;
  const delta = actual ? (minutesDiff(sched, actual) ?? 0) : 0;
  const changed = !!actual && delta !== 0;
  const shown = changed ? actual! : sched;
  return (
    <div className={cn(align === "right" && "text-right")}>
      <p className={cn("flex items-baseline gap-1.5 text-sm font-semibold", align === "right" && "justify-end")}>
        {changed && <s className="text-xs font-normal text-muted decoration-muted/70">{fmtTime(sched)}</s>}
        <span className={cn(changed && deltaTone(delta))}>{fmtTime(shown)}</span>
      </p>
      <p className="text-[11px] text-muted">
        {fmtDate(shown.slice(0, 10), "EEE d MMM")}
        {changed && <span className={cn("ml-1 font-medium", deltaTone(delta))}>{isEstimate ? "est. " : ""}{fmtDelta(delta)}</span>}
      </p>
    </div>
  );
}

/** Average departure / arrival over the last 7 days (needs the AeroDataBox key). */
function HistoryStrip({ flight, history, loading }: { flight: Flight; history: FlightHistory | null; loading: boolean }) {
  if (!hasFlightDataKey()) return <p className="mt-2 px-1 text-[11px] text-muted">Add <span className="font-mono">VITE_AERODATABOX_KEY</span> for live times and 7-day averages.</p>;
  if (loading && !history) return <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-muted"><Loader2 size={11} className="animate-spin" /> Checking the last 7 days…</p>;
  if (!history || !history.samples.length) return <p className="mt-2 px-1 text-[11px] text-muted">No data for {flight.flightNumber} over the last 7 days.</p>;
  const Cell = ({ label, time, delay }: { label: string; time?: string; delay?: number }) => (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{time ?? "—"}{delay != null && <span className={cn("ml-1 text-[11px] font-medium", delay === 0 ? "text-muted" : deltaTone(delay))}>{fmtDelta(delay)}</span>}</p>
    </div>
  );
  return (
    <div className="mt-2 flex items-center gap-4 rounded-2xl border border-line/70 px-3 py-2">
      <div className="flex shrink-0 flex-col items-center text-muted" title={`${fmtDate(history.from, "d MMM")} – ${fmtDate(history.to, "d MMM")}`}><HistoryIcon size={14} /><span className="text-[9px] font-medium">7 days</span></div>
      <Cell label="Avg departure" time={history.avgDepart} delay={history.avgDepartDelay} />
      <Cell label="Avg arrival" time={history.avgArrive} delay={history.avgArriveDelay} />
      {history.onTimePct != null && <div className="ml-auto text-right"><p className="text-[10px] font-medium uppercase tracking-wide text-muted">On time</p><p className={cn("text-sm font-semibold", history.onTimePct >= 80 ? "text-ok" : history.onTimePct >= 50 ? "text-warn" : "text-danger")}>{history.onTimePct}%</p></div>}
    </div>
  );
}

export function FlightCard({ flight, showTrip, compact }: { flight: Flight; showTrip?: boolean; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const [live, setLive] = useState<FlightLive | null>(null);
  const [history, setHistory] = useState<FlightHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const members = useMemberMap();
  const trip = useTrip(showTrip && flight.tripId ? flight.tripId : undefined);
  const past = flight.departAt.slice(0, 10) < today();
  const refresh = async (force = false) => {
    setLoading(true);
    setLive(await fetchFlightStatus(flight));
    setLoading(false);
    if (hasFlightDataKey()) {
      setHistLoading(true);
      setHistory(await fetchFlightHistory(flight.flightNumber, force));
      setHistLoading(false);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5 * 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id, flight.departAt, flight.flightNumber]);

  return (
    <Card className={cn("p-4", past && "opacity-75")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AirlineLogo code={flight.airlineCode ?? parseFlightNumber(flight.flightNumber)?.code} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{flight.airline || flight.airlineCode || "Flight"}</p>
            <p className="font-mono text-xs text-muted">{flight.flightNumber}{flight.terminal && ` · T${flight.terminal.replace(/^T/i, "")}`}{flight.seats && ` · ${flight.seats}`}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <IconBtn onClick={() => void refresh(true)} title="Refresh status" className={cn(loading && "animate-spin")}><RefreshCw size={15} /></IconBtn>
          <IconBtn href={flightTrackerUrl(flight.flightNumber)} title="Track on Flightradar24"><ExternalLink size={15} /></IconBtn>
          <IconBtn onClick={() => setEdit(true)} title="Edit"><Pencil size={15} /></IconBtn>
          <IconBtn danger title="Remove" onClick={async () => { if (confirm("Remove flight?")) { await Promise.all(flight.attachmentIds.map(removeAttachment)); await remove("flights", flight.id); } }}><Trash2 size={15} /></IconBtn>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold tracking-tight">{flight.from || "—"}</p>
          {flight.fromName && <p className="truncate text-[11px] text-muted">{flight.fromName}</p>}
          <TimeBlock manual={flight.departAt} scheduled={live?.scheduledDepart} actual={live?.actualDepart} isEstimate={live?.departIsEstimate} />
          {live?.gate && <p className="text-xs font-medium text-warn">Gate {live.gate}</p>}
        </div>
        <div className="flex flex-col items-center text-muted">
          <div className="flex items-center gap-1"><span className="h-px w-6 bg-line sm:w-10" /><Plane size={14} /><span className="h-px w-6 bg-line sm:w-10" /></div>
        </div>
        <div className="min-w-0 flex-1 text-right">
          <p className="text-2xl font-semibold tracking-tight">{flight.to || "—"}</p>
          {flight.toName && <p className="truncate text-[11px] text-muted">{flight.toName}</p>}
          <TimeBlock manual={flight.arriveAt || flight.departAt} scheduled={live?.scheduledArrive} actual={live?.actualArrive} isEstimate={live?.arriveIsEstimate} align="right" />
        </div>
      </div>

      {!compact && <HistoryStrip flight={flight} history={history} loading={histLoading} />}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <StatusBadge status={reqToReady(flight.status)} />
        {live && <Badge tone={LIVE_META[live.status].tone}>{live.source === "estimated" ? "Est. " : "Live · "}{LIVE_META[live.status].label}</Badge>}
        {trip && <Link to={`/trips/${trip.id}?tab=stay`}><Badge tone="accent">{trip.title}</Badge></Link>}
        {showTrip && !flight.tripId && <Badge>Ad-hoc</Badge>}
        {flight.confirmation && <span className="ml-auto flex items-center gap-1">PNR <span className="font-mono font-semibold text-fg">{flight.confirmation}</span><CopyBtn text={flight.confirmation} /></span>}
        <span className={cn("flex -space-x-1.5", !flight.confirmation && "ml-auto")}>{flight.passengerIds.map((id) => { const m = members.get(id); return m ? <Avatar key={id} name={m.name} size={20} /> : null; })}</span>
      </div>
      {!compact && flight.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{flight.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
      {edit && <FlightForm open onClose={() => setEdit(false)} flight={flight} />}
    </Card>
  );
}
