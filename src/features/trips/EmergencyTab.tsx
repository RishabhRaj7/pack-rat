import { useEffect, useState } from "react";
import { Phone, Siren, Building2, ShieldCheck, Save, Navigation, ExternalLink } from "lucide-react";
import { Card, Field, Input, Textarea, Button } from "@/components/ui";
import { SecretField, useDecrypted } from "@/features/lock/SecretField";
import { useLock } from "@/features/lock/LockProvider";
import { put } from "@/lib/repo";
import { mapsUrl } from "@/lib/utils";
import type { Trip, EmergencyInfo } from "./types";

function Dial({ label, number, tone = "danger" }: { label: string; number?: string; tone?: "danger" | "accent" }) {
  if (!number) return null;
  return (
    <a href={`tel:${number}`} className={`flex items-center justify-between rounded-xl p-3 ${tone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-strong"}`}>
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <span className="flex items-center gap-1.5 text-lg font-extrabold"><Phone size={16} /> {number}</span>
    </a>
  );
}

export function EmergencyTab({ trip }: { trip: Trip }) {
  const { encrypt } = useLock();
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState<EmergencyInfo>(trip.emergency ?? {});
  const { plain: policy, setPlain: setPolicy, ready, unreadable, keepIfUnreadable } = useDecrypted(trip.emergency?.insurancePolicyEnc);
  useEffect(() => {
    setForm(trip.emergency ?? {});
  }, [trip.emergency]);
  const set = (k: keyof EmergencyInfo, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const e = trip.emergency ?? {};

  const save = async () => {
    const insurancePolicyEnc = await keepIfUnreadable(encrypt, false);
    await put("trips", { ...trip, emergency: { ...form, insurancePolicyEnc } });
    setEdit(false);
  };

  if (edit)
    return (
      <Card className="space-y-4 p-4">
        <h2 className="font-bold">Edit emergency info</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Police"><Input value={form.police ?? ""} onChange={(ev) => set("police", ev.target.value)} /></Field>
          <Field label="Ambulance"><Input value={form.ambulance ?? ""} onChange={(ev) => set("ambulance", ev.target.value)} /></Field>
          <Field label="Fire"><Input value={form.fire ?? ""} onChange={(ev) => set("fire", ev.target.value)} /></Field>
          <Field label="General"><Input value={form.general ?? ""} onChange={(ev) => set("general", ev.target.value)} placeholder="112" /></Field>
        </div>
        <Field label="Embassy / consulate name"><Input value={form.embassyName ?? ""} onChange={(ev) => set("embassyName", ev.target.value)} /></Field>
        <Field label="Embassy address"><Input value={form.embassyAddress ?? ""} onChange={(ev) => set("embassyAddress", ev.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Embassy phone"><Input value={form.embassyPhone ?? ""} onChange={(ev) => set("embassyPhone", ev.target.value)} /></Field>
          <Field label="Embassy website"><Input value={form.embassyUrl ?? ""} onChange={(ev) => set("embassyUrl", ev.target.value)} placeholder="https://" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Insurance provider"><Input value={form.insuranceProvider ?? ""} onChange={(ev) => set("insuranceProvider", ev.target.value)} /></Field>
          <Field label="Policy number" hint={unreadable ? "Encrypted with another device's PIN — leave blank to keep it" : "Encrypted"}><Input value={policy} onChange={(ev) => setPolicy(ev.target.value)} disabled={!ready} className="font-mono" /></Field>
          <Field label="24h assistance line"><Input value={form.insurancePhone ?? ""} onChange={(ev) => set("insurancePhone", ev.target.value)} /></Field>
        </div>
        <Field label="Notes"><Textarea value={form.notes ?? ""} onChange={(ev) => set("notes", ev.target.value)} placeholder="Nearest hospital, blood groups, allergies, pharmacy hours…" /></Field>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button onClick={save}><Save size={14} /> Save</Button></div>
      </Card>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="outline" size="sm" onClick={() => setEdit(true)}>Edit</Button></div>
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Siren size={18} className="text-danger" /> Local emergency numbers</h2>
        {e.police || e.ambulance || e.fire || e.general ? (
          <div className="grid gap-2 sm:grid-cols-2"><Dial label="Police" number={e.police} /><Dial label="Ambulance" number={e.ambulance} /><Dial label="Fire" number={e.fire} /><Dial label="General emergency" number={e.general} /></div>
        ) : <p className="text-sm text-muted">Add the local numbers so they're one tap away — even offline.</p>}
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><Building2 size={18} className="text-accent" /> Nearest embassy / consulate</h2>
        {e.embassyName ? (
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold">{e.embassyName}</p>
            {e.embassyAddress && <a href={mapsUrl({ name: e.embassyName, address: e.embassyAddress })} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-muted hover:text-accent"><Navigation size={12} /> {e.embassyAddress}</a>}
            <div className="flex flex-wrap gap-3">{e.embassyPhone && <a href={`tel:${e.embassyPhone}`} className="flex items-center gap-1 font-semibold text-accent"><Phone size={12} /> {e.embassyPhone}</a>}{e.embassyUrl && <a href={e.embassyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold text-accent"><ExternalLink size={12} /> Website</a>}</div>
          </div>
        ) : <p className="text-sm text-muted">Not set.</p>}
      </Card>
      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold"><ShieldCheck size={18} className="text-ok" /> Travel insurance</h2>
        {e.insuranceProvider || e.insurancePolicyEnc ? (
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Provider</p><p className="font-semibold">{e.insuranceProvider || "—"}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Policy number</p><SecretField value={e.insurancePolicyEnc} /></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">24h assistance</p>{e.insurancePhone ? <a href={`tel:${e.insurancePhone}`} className="font-semibold text-accent">{e.insurancePhone}</a> : "—"}</div>
          </div>
        ) : <p className="text-sm text-muted">Add your policy so the number is available instantly.</p>}
      </Card>
      {e.notes && <Card className="p-4 text-sm whitespace-pre-wrap text-muted">{e.notes}</Card>}
    </div>
  );
}
