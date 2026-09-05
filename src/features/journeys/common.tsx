import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Select, Avatar } from "@/components/ui";
import { useMembers } from "@/features/family/hooks";
import { useTrips } from "@/features/trips/hooks";
import { copyToClipboard, cn } from "@/lib/utils";
import { NO_TRIP, type ReqState, type ReadyStatus } from "@/features/trips/types";

export const reqToReady = (s: ReqState): ReadyStatus => (s === "missing" ? "action" : s === "pending" ? "progress" : "ready");

export function BookingStatusSelect({ value, onChange }: { value: ReqState; onChange: (v: ReqState) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as ReqState)}>
      <option value="missing">Not booked</option>
      <option value="pending">Awaiting confirmation</option>
      <option value="done">Confirmed</option>
    </Select>
  );
}

export function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyToClipboard(text)) {
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        }
      }}
      className="rounded-full p-1 text-muted hover:bg-surface-2 hover:text-accent"
      title="Copy"
    >
      {ok ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
    </button>
  );
}

export function PassengerPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const members = useMembers() ?? [];
  if (!members.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {members.map((m) => {
        const on = value.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== m.id) : [...value, m.id])}
            className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition", on ? "border-transparent bg-accent-soft text-accent-strong" : "border-line text-muted hover:bg-surface-2")}
          >
            <Avatar name={m.name} size={20} /> {m.name}
          </button>
        );
      })}
    </div>
  );
}

/** Choose which trip a journey belongs to — or none (ad-hoc). */
export function TripPicker({ value, onChange }: { value: string; onChange: (tripId: string) => void }) {
  const trips = useTrips() ?? [];
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value={NO_TRIP}>Not part of a trip</option>
      {trips.map((t) => (
        <option key={t.id} value={t.id}>
          {t.title} · {t.city}
        </option>
      ))}
    </Select>
  );
}

/** Split an ISO local datetime into date + time parts (tolerates missing time). */
export const splitDT = (v?: string) => ({ date: v?.slice(0, 10) ?? "", time: v && v.length >= 16 ? v.slice(11, 16) : "" });
export const joinDT = (date: string, time: string) => (date ? `${date}T${time || "00:00"}` : "");

/** Small inline icon-button used in card action rows. */
export function IconBtn({ onClick, title, children, danger, href, className }: { onClick?: () => void; title?: string; children: React.ReactNode; danger?: boolean; href?: string; className?: string }) {
  const cls = cn("rounded-full p-2 text-muted transition", danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-surface-2 hover:text-fg", className);
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls} title={title}>
        {children}
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls} title={title}>
      {children}
    </button>
  );
}
