import { useMemo, useState } from "react";
import { PLACE_TAG_ICONS } from "@/components/icons";
import { smartFilter } from "@/lib/search";
import { Plus, Navigation, Pencil, Trash2, ExternalLink, MapPin, Search, X } from "lucide-react";
import { Modal, Button, Field, Input, Textarea, Card, Chip, StatusDot, StatusBadge, EmptyState, Badge, Select } from "@/components/ui";
import { AttachmentList, AttachmentChip } from "@/components/attachments";
import { put, newId, remove, removeAttachment } from "@/lib/repo";
import { mapsUrl, mapsDirectionsUrl, cn, fmtMoney } from "@/lib/utils";
import { usePlaces } from "./hooks";
import { PLACE_TAGS, placeStatus, type Place, type PlaceTag, type ReqState, type Requirement, type ReadyStatus, type Trip } from "./types";

const REQ_PRESETS = ["Ticket booked", "Reservation confirmed", "Prerequisite confirmed", "Transport arranged", "Dress code checked"];
const REQ_STATE_META: Record<ReqState, { label: string; next: ReqState; cls: string }> = {
  missing: { label: "Missing", next: "pending", cls: "bg-danger-soft text-danger" },
  pending: { label: "Pending", next: "done", cls: "bg-warn-soft text-warn" },
  done: { label: "Done", next: "missing", cls: "bg-ok-soft text-ok" },
};

export function RequirementPill({ r, onCycle }: { r: Requirement; onCycle?: () => void }) {
  const meta = REQ_STATE_META[r.state];
  return (
    <button type="button" onClick={onCycle} disabled={!onCycle} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition", meta.cls, onCycle && "hover:brightness-95")} title={onCycle ? "Tap to change status" : undefined}>
      <span className={cn("h-1.5 w-1.5 rounded-full", { missing: "bg-danger", pending: "bg-warn", done: "bg-ok" }[r.state])} /> {r.label} · {meta.label}
    </button>
  );
}

export function PlaceForm({ open, onClose, trip, place }: { open: boolean; onClose: () => void; trip: Trip; place?: Place }) {
  const [form, setForm] = useState<Partial<Place>>(place ?? { tripId: trip.id, name: "", tags: [], requirements: [], attachmentIds: [] });
  const [newReq, setNewReq] = useState("");
  const set = (k: keyof Place, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const addReq = (label: string, state: ReqState = "missing") => {
    if (!label.trim()) return;
    set("requirements", [...(form.requirements ?? []), { id: newId(), label: label.trim(), state }]);
    setNewReq("");
  };
  const save = async () => {
    if (!form.name?.trim()) return;
    await put("places", { ...(form as Place), id: form.id ?? newId(), tags: form.tags ?? [], requirements: form.requirements ?? [], attachmentIds: form.attachmentIds ?? [] });
    onClose();
  };
  const status = placeStatus({ requirements: form.requirements ?? [] });
  return (
    <Modal open={open} onClose={onClose} title={place ? "Edit place" : "Add a place to explore"} size="lg" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!form.name?.trim()}>Save place</Button></>}>
      <div className="space-y-4">
        <Field label="Name"><Input autoFocus value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="Gardens by the Bay" /></Field>
        <Field label="Address / area" hint="Used for the Google Maps link."><Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="18 Marina Gardens Dr, Singapore" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Website / booking link"><Input value={form.url ?? ""} onChange={(e) => set("url", e.target.value)} placeholder="https://" /></Field>
          <Field label={`Est. cost (${trip.currency})`}><Input type="number" min={0} value={form.estimatedCost ?? ""} onChange={(e) => set("estimatedCost", e.target.value ? Number(e.target.value) : undefined)} /></Field>
        </div>
        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {PLACE_TAGS.map((t) => {
              const on = form.tags?.includes(t.value);
              return <Chip key={t.value} active={on} onClick={() => set("tags", on ? form.tags!.filter((x) => x !== t.value) : [...(form.tags ?? []), t.value])}>{t.label}</Chip>;
            })}
          </div>
        </Field>
        <Field label="Requirements checklist" hint="Status: red while anything is missing, amber while pending, teal once all confirmed.">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {(form.requirements ?? []).map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1">
                <RequirementPill r={r} onCycle={() => set("requirements", form.requirements!.map((x) => (x.id === r.id ? { ...x, state: REQ_STATE_META[x.state].next } : x)))} />
                <button type="button" onClick={() => set("requirements", form.requirements!.filter((x) => x.id !== r.id))} className="text-muted hover:text-danger"><X size={12} /></button>
              </span>
            ))}
            {(form.requirements ?? []).length === 0 && <span className="text-xs text-muted">No requirements — counts as confirmed.</span>}
          </div>
          <div className="flex gap-2">
            <Input value={newReq} onChange={(e) => setNewReq(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReq(newReq))} placeholder="Add requirement…" />
            <Button type="button" variant="secondary" onClick={() => addReq(newReq)}><Plus size={14} /></Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REQ_PRESETS.filter((p) => !form.requirements?.some((r) => r.label === p)).map((p) => (
              <button key={p} type="button" onClick={() => addReq(p)} className="rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent">+ {p}</button>
            ))}
          </div>
          <div className="mt-2"><StatusBadge status={status} /></div>
        </Field>
        <Field label="Tickets & documents"><AttachmentList ids={form.attachmentIds ?? []} onChange={(ids) => set("attachmentIds", ids)} /></Field>
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Best time to visit, what to order, insider tips…" /></Field>
      </div>
    </Modal>
  );
}

export function PlaceCard({ place, trip, compact }: { place: Place; trip: Trip; compact?: boolean }) {
  const [edit, setEdit] = useState(false);
  const status = placeStatus(place);
  const cycle = (r: Requirement) => put("places", { ...place, requirements: place.requirements.map((x) => (x.id === r.id ? { ...x, state: REQ_STATE_META[x.state].next } : x)) });
  return (
    <Card className={cn("p-4", status === "action" && "shadow-[inset_4px_0_0_var(--danger)]", status === "progress" && "shadow-[inset_4px_0_0_var(--warn)]", status === "ready" && "shadow-[inset_4px_0_0_var(--ok)]")}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot status={status} pulse />
            <a href={mapsUrl({ name: place.name, address: place.address || trip.city, lat: place.lat, lng: place.lng })} target="_blank" rel="noreferrer" className="truncate font-bold hover:text-accent hover:underline" title="Open in Google Maps">{place.name}</a>
          </div>
          {place.address && <p className="mt-0.5 flex items-center gap-1 text-xs text-muted"><MapPin size={11} /> {place.address}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {place.tags.map((t) => { const meta = PLACE_TAGS.find((x) => x.value === t)!; const I = PLACE_TAG_ICONS[t]; return <Badge key={t}><I size={11} /> {meta.label}</Badge>; })}
            {place.estimatedCost != null && <Badge tone="accent">~{fmtMoney(place.estimatedCost, trip.currency)}</Badge>}
          </div>
          {!compact && place.notes && <p className="mt-2 text-sm text-muted">{place.notes}</p>}
          {place.requirements.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{place.requirements.map((r) => <RequirementPill key={r.id} r={r} onCycle={() => cycle(r)} />)}</div>}
          {!compact && place.attachmentIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{place.attachmentIds.map((id) => <AttachmentChip key={id} id={id} />)}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <a href={mapsDirectionsUrl({ name: place.name, address: place.address || trip.city, lat: place.lat, lng: place.lng })} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg bg-accent-soft px-2 py-1.5 text-xs font-semibold text-accent-strong hover:brightness-95"><Navigation size={13} /> Navigate</a>
          <div className="flex">
            {place.url && <a href={place.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg" title="Website"><ExternalLink size={14} /></a>}
            <button onClick={() => setEdit(true)} className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-fg"><Pencil size={14} /></button>
            <button onClick={async () => { if (confirm(`Remove ${place.name}?`)) { await Promise.all(place.attachmentIds.map(removeAttachment)); await remove("places", place.id); } }} className="rounded-lg p-1.5 text-muted hover:bg-danger-soft hover:text-danger"><Trash2 size={14} /></button>
          </div>
        </div>
      </div>
      {edit && <PlaceForm open onClose={() => setEdit(false)} trip={trip} place={place} />}
    </Card>
  );
}

export function PlacesTab({ trip }: { trip: Trip }) {
  const places = usePlaces(trip.id);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<PlaceTag | "all">("all");
  const [st, setSt] = useState<ReadyStatus | "all">("all");
  const [add, setAdd] = useState(false);
  const list = useMemo(() => smartFilter(places.filter((p) => (tag === "all" || p.tags.includes(tag)) && (st === "all" || placeStatus(p) === st)), q, (p) => [{ value: p.name, weight: 2 }, { value: p.address }, { value: p.notes }, { value: p.tags.map((t) => PLACE_TAGS.find((x) => x.value === t)?.label) }, { value: p.requirements.map((r) => r.label) }]), [places, q, tag, st]);
  const counts = { action: 0, progress: 0, ready: 0 };
  places.forEach((p) => counts[placeStatus(p)]++);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search places…" className="pl-9" />
        </div>
        <Select value={st} onChange={(e) => setSt(e.target.value as ReadyStatus | "all")} className="w-auto">
          <option value="all">All statuses</option>
          <option value="action">Action needed ({counts.action})</option>
          <option value="progress">In progress ({counts.progress})</option>
          <option value="ready">Confirmed ({counts.ready})</option>
        </Select>
        <Button onClick={() => setAdd(true)}><Plus size={16} /> Add place</Button>
      </div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip active={tag === "all"} onClick={() => setTag("all")}>All</Chip>
        {PLACE_TAGS.map((t) => <Chip key={t.value} active={tag === t.value} onClick={() => setTag(t.value)}>{t.label}</Chip>)}
      </div>
      {list.length === 0 ? (
        <EmptyState icon={<MapPin />} title={places.length ? "No places match" : "No places yet"} hint={places.length ? "" : "Add the spots you want to explore — food, sights, shopping. Then build your itinerary from them."} action={!places.length && <Button onClick={() => setAdd(true)}><Plus size={16} /> Add first place</Button>} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">{list.map((p) => <PlaceCard key={p.id} place={p} trip={trip} />)}</div>
      )}
      {add && <PlaceForm open onClose={() => setAdd(false)} trip={trip} />}
    </div>
  );
}
