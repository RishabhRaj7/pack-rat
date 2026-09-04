import { useEffect, useMemo, useState } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X, Share2, Navigation, CloudSun, ShoppingBag, Ban, StickyNote, Check, Copy, CalendarPlus, Sparkles } from "lucide-react";
import { Button, Card, StatusDot, Badge, Textarea, Modal, Input, EmptyState, Field } from "@/components/ui";
import { put, newId, remove } from "@/lib/repo";
import { fmtDate, dateRange, mapsDirectionsUrl, cn, copyToClipboard, today } from "@/lib/utils";
import { fetchForecast, packingSuggestions, weatherLabel, type DayForecast } from "@/lib/services";
import { useItinerary, usePlaces } from "./hooks";
import { placeStatus, PLACE_TAGS, type ItineraryDay, type Place, type Trip } from "./types";
import { publishTrip } from "./publish";
import { ScrollStrip } from "@/components/sync";

function SortablePlace({ place, trip, index, onRemove }: { place: Place; trip: Trip; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: place.id });
  const status = placeStatus(place);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-2 rounded-xl border border-line bg-surface p-2.5", isDragging && "z-10 shadow-lg ring-2 ring-accent/40")}>
      <button {...attributes} {...listeners} className="cursor-grab touch-none rounded-lg p-1 text-muted hover:bg-surface-2 active:cursor-grabbing" aria-label="Drag to reorder"><GripVertical size={16} /></button>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{index + 1}</span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold"><StatusDot status={status} /> {place.name}</p>
        <p className="truncate text-[11px] text-muted">{place.tags.map((t) => PLACE_TAGS.find((x) => x.value === t)?.emoji).join(" ")} {place.address}</p>
      </div>
      <a href={mapsDirectionsUrl({ name: place.name, address: place.address || trip.city, lat: place.lat, lng: place.lng })} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-accent hover:bg-accent-soft" title="Navigate"><Navigation size={14} /></a>
      <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger" title="Remove from day"><X size={14} /></button>
    </div>
  );
}

function DayTitleInput({ day }: { day: ItineraryDay }) {
  const [title, setTitle] = useState(day.title ?? "");
  return (
    <Input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== (day.title ?? "") && put("itineraryDays", { ...day, title })} placeholder={`Day plan · ${fmtDate(day.date, "EEEE d MMMM")}`} className="border-transparent bg-transparent px-0 text-base font-bold focus:border-line focus:bg-surface focus:px-3" />
  );
}

function DayPrepPanel({ trip, day, forecast, stale }: { trip: Trip; day: ItineraryDay; forecast?: DayForecast; stale: boolean }) {
  const [prep, setPrep] = useState(day.prep ?? {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setPrep(day.prep ?? {}), [day.id]);
  const save = (patch: Partial<typeof prep>) => {
    const next = { ...prep, ...patch };
    setPrep(next);
    void put("itineraryDays", { ...day, prep: next });
  };
  const w = forecast ? weatherLabel(forecast.code) : null;
  const farOut = !forecast && new Date(day.date) > new Date(Date.now() + 16 * 86400000);
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted"><Sparkles size={14} className="text-accent" /> Daily prep · {fmtDate(day.date, "EEE d MMM")}</h3>
      <div className="rounded-xl bg-gradient-to-br from-teal-deep to-teal p-4 text-white dark:from-navy dark:to-teal-deep">
        <div className="flex items-center justify-between">
          <div><p className="text-xs uppercase tracking-wide text-white/70"><CloudSun size={12} className="mr-1 inline" /> Forecast · {trip.city}</p>
            {forecast ? <p className="mt-1 text-2xl font-extrabold">{Math.round(forecast.tMax)}° <span className="text-base font-semibold text-white/70">/ {Math.round(forecast.tMin)}°</span></p> : <p className="mt-1 text-sm font-semibold">{farOut ? "Forecast opens 16 days before" : "Forecast unavailable offline"}</p>}
          </div>
          {w && <div className="text-right"><p className="text-4xl">{w.emoji}</p><p className="text-xs font-semibold">{w.label}</p></div>}
        </div>
        {forecast && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/85"><span>☔ {forecast.precipProb}% · {forecast.precipMm.toFixed(1)} mm</span><span>☀️ UV {forecast.uv.toFixed(0)}</span><span>💨 {Math.round(forecast.windMax)} km/h</span>{stale && <span className="text-white/60">cached</span>}</div>}
      </div>
      {forecast && (
        <div className="mt-3">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Pack for today</p>
          <ul className="space-y-1 text-sm">{packingSuggestions(forecast).map((s) => <li key={s} className="flex gap-2"><Check size={14} className="mt-0.5 shrink-0 text-ok" /> {s}</li>)}</ul>
        </div>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Worth buying today"><div className="relative"><ShoppingBag size={14} className="absolute left-3 top-3 text-ok" /><Textarea value={prep.buy ?? ""} onChange={(e) => save({ buy: e.target.value })} className="min-h-[60px] pl-9" placeholder="Kaya toast kit at the hawker centre, TWG tea…" /></div></Field>
        <Field label="Best avoided today"><div className="relative"><Ban size={14} className="absolute left-3 top-3 text-danger" /><Textarea value={prep.avoid ?? ""} onChange={(e) => save({ avoid: e.target.value })} className="min-h-[60px] pl-9" placeholder="Outdoor queues after 1pm, taxis during peak surcharge…" /></div></Field>
        <Field label="Notes"><div className="relative"><StickyNote size={14} className="absolute left-3 top-3 text-warn" /><Textarea value={prep.general ?? ""} onChange={(e) => save({ general: e.target.value })} className="min-h-[60px] pl-9" placeholder="Carry passport for GST refund, book Grab by 8am…" /></div></Field>
      </div>
    </Card>
  );
}

export function ItineraryTab({ trip }: { trip: Trip }) {
  const days = useItinerary(trip.id);
  const places = usePlaces(trip.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [q, setQ] = useState("");
  const [forecast, setForecast] = useState<{ days: DayForecast[]; stale: boolean } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 4 } }), useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const placeMap = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const selected = days.find((d) => d.id === selectedId) ?? days.find((d) => d.date === today()) ?? days[0];
  useEffect(() => { if (trip.lat || trip.lng) fetchForecast(trip.lat, trip.lng, trip.timezone).then((f) => setForecast({ days: f.days, stale: f.stale })).catch(() => setForecast(null)); }, [trip.lat, trip.lng, trip.timezone]);

  const scheduledIds = new Set(days.flatMap((d) => d.placeIds));
  const unscheduled = places.filter((p) => !scheduledIds.has(p.id));

  const onDragEnd = (e: DragEndEvent) => {
    if (!selected || !e.over || e.active.id === e.over.id) return;
    const from = selected.placeIds.indexOf(String(e.active.id));
    const to = selected.placeIds.indexOf(String(e.over.id));
    void put("itineraryDays", { ...selected, placeIds: arrayMove(selected.placeIds, from, to) });
  };

  const generateDays = async () => {
    const existing = new Set(days.map((d) => d.date));
    for (const date of dateRange(trip.startDate, trip.endDate)) if (!existing.has(date)) await put("itineraryDays", { id: newId(), tripId: trip.id, date, placeIds: [] });
  };
  const autoFill = async () => {
    // Simple helper: spread unscheduled places evenly across days, ~3 per day, keeping tag variety.
    if (!unscheduled.length || !days.length) return;
    const perDay = Math.max(3, Math.ceil(unscheduled.length / days.length));
    const queue = [...unscheduled];
    for (const d of days) {
      const take = queue.splice(0, Math.max(0, perDay - d.placeIds.length));
      if (take.length) await put("itineraryDays", { ...d, placeIds: [...d.placeIds, ...take.map((p) => p.id)] });
    }
  };

  const missingDays = dateRange(trip.startDate, trip.endDate).filter((dt) => !days.some((d) => d.date === dt));

  if (days.length === 0) return <EmptyState icon={<CalendarPlus />} title="No itinerary days yet" hint={`Create a day for each date from ${fmtDate(trip.startDate)} to ${fmtDate(trip.endDate)}.`} action={<Button onClick={generateDays}><CalendarPlus size={16} /> Generate days</Button>} />;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ScrollStrip className="flex-1 pb-1" activeKey={selected?.id}>
          {days.map((d, i) => {
            const dayPlaces = d.placeIds.map((id) => placeMap.get(id)).filter(Boolean) as Place[];
            const worst = dayPlaces.some((p) => placeStatus(p) === "action") ? "action" : dayPlaces.some((p) => placeStatus(p) === "progress") ? "progress" : "ready";
            return (
              <button key={d.id} type="button" data-strip-key={d.id} onClick={() => setSelectedId(d.id)} className={cn("flex min-w-[76px] shrink-0 flex-col items-center rounded-xl border px-3 py-2 transition", selected?.id === d.id ? "border-accent bg-accent text-on-accent" : "border-line bg-surface hover:border-accent/50")}>
                <span className="text-[10px] font-bold uppercase opacity-70">Day {i + 1}</span>
                <span className="text-sm font-extrabold">{fmtDate(d.date, "d MMM")}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[10px] opacity-80">{dayPlaces.length > 0 && <StatusDot status={worst} className="h-1.5 w-1.5 [&>span]:h-1.5 [&>span]:w-1.5" />} {dayPlaces.length} stops</span>
              </button>
            );
          })}
          {missingDays.length > 0 && <button onClick={generateDays} className="flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-line px-3 text-xs text-muted hover:border-accent hover:text-accent"><Plus size={12} /> {missingDays.length} more day{missingDays.length > 1 && "s"}</button>}
        </ScrollStrip>
        <div className="flex gap-2">
          {unscheduled.length > 0 && <Button variant="secondary" size="sm" onClick={autoFill} title="Spread unscheduled places across days"><Sparkles size={14} /> Auto-fill {unscheduled.length}</Button>}
          <Button variant="outline" size="sm" onClick={async () => { setShareUrl(await publishTrip(trip)); }}><Share2 size={14} /> Publish</Button>
        </div>
      </div>

      {selected && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <DayTitleInput key={selected.id} day={selected} />
                <Button size="sm" onClick={() => setPicker(true)}><Plus size={14} /> Add stop</Button>
              </div>
              {selected.placeIds.length === 0 ? (
                <EmptyState icon={<CalendarPlus />} title="Nothing planned yet" hint="Add stops from your places list, then drag to reorder." action={<Button variant="secondary" size="sm" onClick={() => setPicker(true)}><Plus size={14} /> Add stop</Button>} />
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={selected.placeIds} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {selected.placeIds.map((id, i) => { const p = placeMap.get(id); return p ? <SortablePlace key={id} place={p} trip={trip} index={i} onRemove={() => put("itineraryDays", { ...selected, placeIds: selected.placeIds.filter((x) => x !== id) })} /> : null; })}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
              {selected.placeIds.length > 1 && (
                <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/${selected.placeIds.map((id) => placeMap.get(id)).filter(Boolean).map((p) => (p!.lat != null ? `${p!.lat},${p!.lng}` : encodeURIComponent(`${p!.name}, ${p!.address || trip.city}`))).join("/")}`}>
                  <Navigation size={12} /> Open full day route in Google Maps
                </a>
              )}
            </Card>
            {days.length > 1 && <button onClick={async () => { if (confirm("Remove this day from the itinerary?")) { await remove("itineraryDays", selected.id); setSelectedId(null); } }} className="mt-2 text-xs text-muted hover:text-danger">Remove day</button>}
          </div>
          <DayPrepPanel trip={trip} day={selected} forecast={forecast?.days.find((f) => f.date === selected.date)} stale={forecast?.stale ?? false} />
        </div>
      )}

      <Modal open={picker} onClose={() => setPicker(false)} title="Add stops to this day" footer={<Button onClick={() => setPicker(false)}>Done</Button>}>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter places…" className="mb-3" />
        <div className="space-y-1.5">
          {places.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase())).map((p) => {
            const inDay = selected?.placeIds.includes(p.id);
            const elsewhere = !inDay && scheduledIds.has(p.id);
            return (
              <button key={p.id} disabled={inDay} onClick={() => selected && put("itineraryDays", { ...selected, placeIds: [...selected.placeIds, p.id] })} className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition", inDay ? "border-accent bg-accent-soft opacity-70" : "border-line hover:border-accent/50")}>
                <StatusDot status={placeStatus(p)} /><span className="flex-1 font-semibold">{p.name}</span>
                {inDay ? <Badge tone="accent">Added</Badge> : elsewhere ? <Badge>Other day</Badge> : <Plus size={14} className="text-muted" />}
              </button>
            );
          })}
          {places.length === 0 && <p className="text-center text-sm text-muted">Add places first from the Places tab.</p>}
        </div>
      </Modal>

      <Modal open={!!shareUrl} onClose={() => setShareUrl(null)} title="Itinerary published" size="sm">
        <p className="mb-3 text-sm text-muted">Anyone with this link sees a read-only version of the day-by-day plan. No documents, confirmations or ID numbers are included.</p>
        <div className="flex gap-2"><Input readOnly value={shareUrl ?? ""} className="font-mono text-xs" /><Button variant="secondary" onClick={async () => { if (shareUrl && (await copyToClipboard(shareUrl))) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}>{copied ? <Check size={16} /> : <Copy size={16} />}</Button></div>
        <div className="mt-3 flex gap-2"><a href={shareUrl ?? "#"} target="_blank" rel="noreferrer" className="text-sm font-semibold text-accent hover:underline">Open preview →</a>{"share" in navigator && <button onClick={() => navigator.share({ title: trip.title, url: shareUrl! })} className="text-sm font-semibold text-accent hover:underline">Share…</button>}</div>
      </Modal>
    </div>
  );
}
