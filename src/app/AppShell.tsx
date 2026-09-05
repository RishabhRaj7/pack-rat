import { NavLink, Outlet } from "react-router-dom";
import { Home, Plane, Users, FolderLock, ArrowLeftRight, Settings, Lock, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLock } from "@/features/lock/LockProvider";
import { useSyncStatus } from "@/lib/sync";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/trips", label: "Trips", icon: Plane },
  { to: "/family", label: "Family", icon: Users },
  { to: "/vault", label: "Vault", icon: FolderLock },
  { to: "/convert", label: "Convert", icon: ArrowLeftRight },
  { to: "/settings", label: "Settings", icon: Settings },
];

function SyncIndicator() {
  const s = useSyncStatus();
  const Icon = !s.online ? CloudOff : s.syncing ? RefreshCw : Cloud;
  const label = !s.online ? "Offline" : s.syncing ? "Syncing…" : s.user ? "Synced" : s.configured ? "Not signed in" : "Local";
  return (
    <span className={cn("flex items-center gap-1.5 text-[11px] font-semibold text-muted", s.syncing && "[&>svg]:animate-spin")} title={label}>
      <Icon size={13} /> <span className="hidden lg:inline">{label}</span>{s.pending > 0 && s.configured && <span className="rounded-full bg-warn-soft px-1.5 text-warn">{s.pending}</span>}
    </span>
  );
}

export function AppShell() {
  const { lock } = useLock();
  return (
    <div className="flex min-h-full">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-bg p-4 md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-3 pt-2">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
          <div><p className="text-base font-semibold leading-none tracking-tight">Pack Rat</p><p className="mt-0.5 text-[11px] text-muted">Travel & document vault</p></div>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("flex items-center gap-3 rounded-full px-4 py-3 text-sm font-medium transition", isActive ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-fg")}>
              <n.icon size={18} /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between px-2 pt-3">
          <SyncIndicator />
          <button onClick={lock} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-fg"><Lock size={13} /> Lock</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/85 px-4 py-3 backdrop-blur md:hidden">
          <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-7 w-7 rounded-lg" /><span className="font-semibold tracking-tight">Pack Rat</span></div>
          <div className="flex items-center gap-3"><SyncIndicator /><button onClick={lock} className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Lock"><Lock size={16} /></button></div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-10">
          <Outlet />
        </main>

        {/* Bottom nav (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex bg-surface-2/95 pt-2 backdrop-blur safe-bottom md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("group flex flex-1 flex-col items-center gap-1 pb-1 text-[11px] font-medium", isActive ? "text-fg" : "text-muted")}>
              {({ isActive }) => (<><span className={cn("flex h-8 w-16 items-center justify-center rounded-full transition", isActive ? "bg-accent-soft text-accent-strong" : "group-hover:bg-surface-3")}><n.icon size={20} /></span>{n.label}</>)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
