import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Navigation, ShoppingBag, Ban, StickyNote, Hotel } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { decodeShared, fetchPublished, type PublishedItinerary } from "@/features/trips/publish";
import { PLACE_TAGS } from "@/features/trips/types";
import { fmtDate, flag, mapsDirectionsUrl, mapsUrl } from "@/lib/utils";

/** Public, read-only itinerary view. Rendered without the lock or app shell. */
export function SharePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [data, setData] = useState<PublishedItinerary | null | undefined>(undefined);
  useEffect(() => {
    const d = params.get("d");
    if (d) setData(decodeShared(d));
    else if (id) fetchPublished(id).then(setData).catch(() => setData(null));
    else setData(null);
  }, [id, params]);

  if (data === undefined) return <div className="p-10 text-center text-muted">Loading itinerary…</div>;
  if (!data) return <div className="p-10 text-center"><p className="font-bold">This itinerary link is invalid or has expired.</p><Link to="/" className="text-accent underline">Go to Passport</Link></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6 rounded-3xl bg-gradient-to-br from-teal-deep via-teal to-mint p-6 text-white dark:from-navy dark:via-teal-deep dark:to-teal">
        <p className="text-4xl">{data.emoji}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{data.title}</h1>
        <p className="text-white/85">{flag(data.countryCode)} {data.city}, {data.country} · {fmtDate(data.startDate, "d MMM")} – {fmtDate(data.endDate)}</p>
        <Badge className="mt-3 bg-white/20 text-white">Read-only itinerary</Badge>
      </div>
      {data.hotel && (
        <Card className="mb-4 flex items-center gap-3 p-4"><Hotel className="text-accent" size={20} /><div className="flex-1"><p className="font-bold">{data.hotel.name}</p><a href={mapsUrl({ name: data.hotel.name, address: data.hotel.address })} target="_blank" rel="noreferrer" className="text-xs text-muted hover:text-accent">{data.hotel.address}</a></div><p className="text-right text-xs text-muted">{fmtDate(data.hotel.checkIn, "d MMM")} → {fmtDate(data.hotel.checkOut, "d MMM")}</p></Card>
      )}
      <div className="space-y-4">
        {data.days.map((d, i) => (
          <Card key={d.date} className="p-4">
            <div className="mb-3 flex items-baseline justify-between"><h2 className="text-lg font-extrabold">Day {i + 1} <span className="text-sm font-semibold text-muted">· {fmtDate(d.date, "EEEE d MMMM")}</span></h2></div>
            {d.title && <p className="mb-2 font-semibold">{d.title}</p>}
            {d.places.length === 0 ? <p className="text-sm text-muted">Free day</p> : (
              <ol className="space-y-2">
                {d.places.map((p, j) => (
                  <li key={j} className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">{j + 1}</span>
                    <div className="min-w-0 flex-1"><p className="font-semibold">{p.name} <span className="text-xs">{p.tags.map((t) => PLACE_TAGS.find((x) => x.value === t)?.emoji).join(" ")}</span></p>{p.address && <p className="text-xs text-muted">{p.address}</p>}{p.notes && <p className="mt-1 text-sm text-muted">{p.notes}</p>}</div>
                    <a href={mapsDirectionsUrl({ name: p.name, address: p.address || data.city, lat: p.lat, lng: p.lng })} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-accent hover:bg-accent-soft"><Navigation size={16} /></a>
                  </li>
                ))}
              </ol>
            )}
            {(d.prep?.buy || d.prep?.avoid || d.prep?.general) && (
              <div className="mt-3 space-y-1 text-sm">
                {d.prep.buy && <p className="flex gap-2"><ShoppingBag size={14} className="mt-0.5 text-ok" /> {d.prep.buy}</p>}
                {d.prep.avoid && <p className="flex gap-2"><Ban size={14} className="mt-0.5 text-danger" /> {d.prep.avoid}</p>}
                {d.prep.general && <p className="flex gap-2"><StickyNote size={14} className="mt-0.5 text-warn" /> {d.prep.general}</p>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-muted">Published with Passport · {fmtDate(new Date(data.publishedAt).toISOString().slice(0, 10))}</p>
    </div>
  );
}
