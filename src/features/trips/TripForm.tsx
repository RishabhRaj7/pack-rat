import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin } from "lucide-react";
import { Modal, Button, Field, Input, Select, Textarea, Avatar } from "@/components/ui";
import { COUNTRIES, dateRange, cn } from "@/lib/utils";
import { put, newId } from "@/lib/repo";
import { geocode } from "@/lib/services";
import { useMembers } from "@/features/family/hooks";
import type { Trip } from "./types";

/** "+ New Trip" flow. Also used for editing. Creates the itinerary day skeleton automatically. */
export function TripForm({ open, onClose, trip }: { open: boolean; onClose: () => void; trip?: Trip }) {
  const nav = useNavigate();
  const members = useMembers() ?? [];
  const [form, setForm] = useState<Partial<Trip>>(
    trip ?? { title: "", country: "", countryCode: "", city: "", startDate: "", endDate: "", currency: "", coverEmoji: "", travellerIds: members.map((m) => m.id), emergency: {} }
  );
  const [saving, setSaving] = useState(false);
  const set = (k: keyof Trip, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.title?.trim() && form.countryCode && form.city?.trim() && form.startDate && form.endDate && form.endDate >= form.startDate;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    let { lat, lng } = form;
    if (lat == null || lng == null || (trip && (trip.city !== form.city || trip.countryCode !== form.countryCode))) {
      const g = await geocode(`${form.city}, ${form.country}`);
      lat = g?.lat ?? 0;
      lng = g?.lng ?? 0;
    }
    const id = form.id ?? newId();
    await put("trips", { ...(form as Trip), id, lat: lat!, lng: lng!, travellerIds: form.travellerIds ?? [], emergency: form.emergency ?? {} });
    if (!trip) {
      for (const date of dateRange(form.startDate!, form.endDate!)) await put("itineraryDays", { id: newId(), tripId: id, date, placeIds: [] });
    }
    setSaving(false);
    onClose();
    if (!trip) nav(`/trips/${id}`);
  };

  return (
    <Modal open={open} onClose={onClose} title={trip ? "Edit trip" : "Plan a new trip"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={!valid} loading={saving}>{trip ? "Save" : "Create trip"}</Button></>}>
      <div className="space-y-4">
        <Field label="Trip name"><Input autoFocus value={form.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder="Singapore family getaway" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <Select
              value={form.countryCode ?? ""}
              onChange={(e) => {
                const c = COUNTRIES.find((x) => x.code === e.target.value);
                setForm((f) => ({ ...f, countryCode: c?.code ?? "", country: c?.name ?? "", currency: c?.currency ?? f.currency }));
              }}
            >
              <option value="">Select</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="City"><Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Singapore" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start"><Input type="date" value={form.startDate ?? ""} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="End"><Input type="date" min={form.startDate} value={form.endDate ?? ""} onChange={(e) => set("endDate", e.target.value)} /></Field>
        </div>
        <Field label="Local currency" hint="Auto-filled from the country; change if needed."><Input value={form.currency ?? ""} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} className="uppercase" /></Field>
        {members.length > 0 && (
          <Field label="Who's going?">
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const on = form.travellerIds?.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => set("travellerIds", on ? form.travellerIds!.filter((x) => x !== m.id) : [...(form.travellerIds ?? []), m.id])} className={cn("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs font-semibold transition", on ? "border-accent bg-accent-soft" : "border-line text-muted")}>
                    <Avatar name={m.name} size={22} /> {m.name}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} placeholder="Visa requirements, SIM card plan, things to remember…" /></Field>
        <p className="flex items-center gap-1 text-xs text-muted"><MapPin size={12} /> The city is geocoded for weather forecasts.</p>
      </div>
    </Modal>
  );
}
