import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { Plane, ShieldAlert, ArrowRight, Users, FolderLock, CreditCard, WifiOff } from "lucide-react";
import { db } from "@/lib/db";
import { Card, Badge, Avatar, StatusDot, Button } from "@/components/ui";
import { useMemberMap } from "@/features/family/hooks";
import { useTrips } from "@/features/trips/hooks";
import { tripStatus, placeStatus } from "@/features/trips/types";
import { expiryStatus, DOCUMENT_TYPES } from "@/features/documents/types";
import { useSyncStatus } from "@/lib/sync";
import { fmtDate, daysBetween, today, flag } from "@/lib/utils";

export function HomePage() {
  const trips = useTrips() ?? [];
  const docs = useLiveQuery(() => db.documents.toArray(), []) ?? [];
  const loyalty = useLiveQuery(() => db.loyalty.count(), []) ?? 0;
  const members = useMemberMap();
  const sync = useSyncStatus();
  const next = trips.filter((t) => tripStatus(t) !== "completed").sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const nextPlaces = useLiveQuery(() => (next ? db.places.where("tripId").equals(next.id).toArray() : []), [next?.id]) ?? [];
  const reminders = docs
    .map((d) => ({ d, ...expiryStatus(d.expiryDate) }))
    .filter((x) => x.status !== "ok" && x.status !== "none")
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const counts = { action: 0, progress: 0, ready: 0 };
  nextPlaces.forEach((p) => counts[placeStatus(p)]++);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">{greet} 👋</p>
        <h1 className="text-2xl font-extrabold tracking-tight">Ready for your next trip?</h1>
      </div>
      {!sync.online && <div className="flex items-center gap-2 rounded-xl bg-warn-soft px-4 py-2 text-sm font-semibold text-warn"><WifiOff size={16} /> You're offline — viewing saved data. Changes will sync later.</div>}

      {next ? (
        <Link to={`/trips/${next.id}`}>
          <Card className="overflow-hidden transition hover:border-accent/50">
            <div className="bg-gradient-to-br from-teal-deep via-teal to-mint p-5 text-white dark:from-navy dark:via-teal-deep dark:to-teal">
              <div className="flex items-start justify-between"><div><Badge className="bg-white/20 text-white">{tripStatus(next) === "ongoing" ? "Happening now" : `In ${daysBetween(today(), next.startDate)} days`}</Badge><h2 className="mt-2 text-2xl font-extrabold">{next.title}</h2><p className="text-white/85">{flag(next.countryCode)} {next.city} · {fmtDate(next.startDate, "d MMM")} – {fmtDate(next.endDate)}</p></div><span className="text-5xl">{next.coverEmoji}</span></div>
            </div>
            <div className="flex items-center justify-between px-5 py-3 text-sm">
              <span className="flex items-center gap-3 font-semibold"><span className="flex items-center gap-1"><StatusDot status="ready" /> {counts.ready}</span><span className="flex items-center gap-1"><StatusDot status="progress" /> {counts.progress}</span><span className="flex items-center gap-1"><StatusDot status="action" /> {counts.action}</span><span className="text-muted">of {nextPlaces.length} places</span></span>
              <span className="flex items-center gap-1 font-semibold text-accent">Open <ArrowRight size={14} /></span>
            </div>
          </Card>
        </Link>
      ) : (
        <Card className="flex items-center justify-between gap-4 p-5"><div><p className="font-bold">No upcoming trips</p><p className="text-sm text-muted">Start planning your next destination.</p></div><Link to="/trips"><Button><Plane size={16} /> Plan a trip</Button></Link></Card>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 font-bold"><ShieldAlert size={16} className="text-danger" /> Expiry reminders</h2><Link to="/vault" className="text-xs font-semibold text-accent">Open vault</Link></div>
        {reminders.length === 0 ? (
          <Card className="p-4 text-sm text-muted">{docs.length ? "All documents are valid for 6+ months. ✅" : "Add passports and visas to get renewal reminders (6-month rule aware)."}</Card>
        ) : (
          <Card className="divide-y divide-line">
            {reminders.slice(0, 5).map(({ d, status, days }) => { const m = members.get(d.memberId); const t = DOCUMENT_TYPES.find((x) => x.value === d.type)!; return (
              <Link key={d.id} to={`/family/${d.memberId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
                <span className="text-xl">{t.icon}</span><div className="flex-1"><p className="text-sm font-semibold">{m?.name} · {d.label || t.label}</p><p className="text-xs text-muted">Expires {fmtDate(d.expiryDate)}</p></div>
                <Badge tone={status === "soon" ? "warn" : "danger"}>{status === "expired" ? "Expired" : `${days} days`}</Badge>
              </Link>
            ); })}
          </Card>
        )}
      </section>

      <div className="grid grid-cols-3 gap-3">
        <Link to="/family"><Card className="p-4 text-center transition hover:border-accent/50"><Users className="mx-auto text-accent" size={20} /><p className="mt-1 text-xl font-extrabold">{members.size}</p><p className="text-xs text-muted">Family</p></Card></Link>
        <Link to="/vault"><Card className="p-4 text-center transition hover:border-accent/50"><FolderLock className="mx-auto text-accent" size={20} /><p className="mt-1 text-xl font-extrabold">{docs.length}</p><p className="text-xs text-muted">Documents</p></Card></Link>
        <Link to="/loyalty"><Card className="p-4 text-center transition hover:border-accent/50"><CreditCard className="mx-auto text-accent" size={20} /><p className="mt-1 text-xl font-extrabold">{loyalty}</p><p className="text-xs text-muted">Loyalty</p></Card></Link>
      </div>

      {members.size > 0 && (
        <section><h2 className="mb-2 font-bold">Travellers</h2><div className="flex flex-wrap gap-2">{[...members.values()].map((m) => <Link key={m.id} to={`/family/${m.id}`} className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm font-semibold hover:border-accent/50"><Avatar name={m.name} size={26} /> {m.name}</Link>)}</div></section>
      )}
    </div>
  );
}
