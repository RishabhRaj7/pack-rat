import { useEffect } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { LockProvider, useLock } from "@/features/lock/LockProvider";
import { LockScreen } from "@/features/lock/LockScreen";
import { AppShell } from "@/app/AppShell";
import { HomePage } from "@/features/home/HomePage";
import { TripsPage } from "@/features/trips/TripsPage";
import { TripDetailPage } from "@/features/trips/TripDetailPage";
import { FamilyPage } from "@/features/family/FamilyPage";
import { ProfilePage } from "@/features/family/ProfilePage";
import { VaultPage } from "@/features/documents/VaultPage";
import { LoyaltyPage } from "@/features/loyalty/LoyaltyPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { SharePage } from "@/features/share/SharePage";
import { initSync } from "@/lib/sync";
import { seedSingapore } from "@/data/seed";

/** Everything except the public share page sits behind the app lock. */
function Gate() {
  const { state } = useLock();
  const location = useLocation();
  useEffect(() => {
    if (state === "unlocked") void seedSingapore();
  }, [state]);
  // NOTE: keep a block body here. In recent Chromium builds `window.scrollTo()` returns a
  // Promise; returning it from an effect makes React treat it as the cleanup function and
  // crash with "… is not a function" on the first navigation after unlock.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (state === "loading") return <div className="flex min-h-full items-center justify-center text-sm text-muted">Opening vault…</div>;
  if (state !== "unlocked") return <LockScreen />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="trips" element={<TripsPage />} />
        <Route path="trips/:id" element={<TripDetailPage />} />
        <Route path="family" element={<FamilyPage />} />
        <Route path="family/:id" element={<ProfilePage />} />
        <Route path="vault" element={<VaultPage />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  useEffect(() => {
    initSync();
  }, []);
  return (
    <HashRouter>
      <LockProvider>
        <Routes>
          <Route path="/share" element={<SharePage />} />
          <Route path="/share/:id" element={<SharePage />} />
          <Route path="/*" element={<Gate />} />
        </Routes>
      </LockProvider>
    </HashRouter>
  );
}
