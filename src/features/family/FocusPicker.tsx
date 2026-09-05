import { Users } from "lucide-react";
import { Avatar } from "@/components/ui";
import { useFocusMembers } from "@/lib/prefs";
import { cn } from "@/lib/utils";
import { useMembers } from "./hooks";

/**
 * "Viewing for" chips: Everyone, or any combination of family members.
 * Selection is a device preference (IndexedDB settings) so each person's phone remembers their own focus.
 */
export function FocusPicker({ className }: { className?: string }) {
  const members = useMembers() ?? [];
  const [focus, setFocus] = useFocusMembers();
  if (members.length < 2) return null;
  const everyone = focus.length === 0;
  const toggle = (id: string) => {
    const next = focus.includes(id) ? focus.filter((x) => x !== id) : [...focus, id];
    void setFocus(next.length === members.length ? [] : next);
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <button
        type="button"
        onClick={() => void setFocus([])}
        className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-2 pr-3 text-xs font-medium transition", everyone ? "border-transparent bg-accent-soft text-accent-strong" : "border-line text-muted hover:bg-surface-2")}
      >
        <Users size={14} /> Everyone
      </button>
      {members.map((m) => {
        const on = focus.includes(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => toggle(m.id)}
            aria-pressed={on}
            className={cn("flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs font-medium transition", on ? "border-transparent bg-accent-soft text-accent-strong" : "border-line text-muted hover:bg-surface-2")}
          >
            <Avatar name={m.name} size={22} /> {m.name}
          </button>
        );
      })}
    </div>
  );
}

/** One-line summary of the current focus, e.g. "Rishabh & Priya". */
export function useFocusLabel() {
  const members = useMembers() ?? [];
  const [focus] = useFocusMembers();
  if (!focus.length) return null;
  const names = focus.map((id) => members.find((m) => m.id === id)?.name).filter(Boolean) as string[];
  if (!names.length) return null;
  return names.length <= 2 ? names.join(" & ") : `${names[0]} +${names.length - 1}`;
}
