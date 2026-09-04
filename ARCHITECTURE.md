# Passport — architecture notes

Offline-first PWA for trip planning + an encrypted family document vault.
Stack: React 19 · Vite · Tailwind v4 · Dexie (IndexedDB) · Firebase (optional) · dnd-kit · Open-Meteo · Frankfurter.

```
public/
  sw.js                  hand-written service worker (shell: stale-while-revalidate, data APIs: network-first w/ cache fallback)
  manifest.webmanifest   installable PWA manifest
src/
  app/AppShell.tsx       sidebar / bottom-nav layout
  App.tsx                routes; everything except /share sits behind the lock gate
  lib/
    db.ts                Dexie schema (single source of truth for the UI)
    repo.ts              put/remove with timestamps + sync queue; cascades
    crypto.ts            PIN → PBKDF2 → AES-GCM; WebAuthn-gated key wrapping for biometrics
    firebase.ts          lazy Firebase init; no-op when VITE_FIREBASE_* is missing
    sync.ts              queue flush → Firestore/Storage; onSnapshot → IndexedDB (last-write-wins, tombstones)
    services.ts          weather, packing suggestions, FX rates, flight status adapter, geocoding
    theme.ts             light / dark (AMOLED) / system
  components/            ui.tsx (design system), attachments.tsx (file blobs in IndexedDB)
  features/
    lock/                LockProvider (in-memory key, auto-lock), LockScreen, SecretField
    family/              members + profile page
    documents/           ID vault: form, card, search, expiry logic
    trips/               Trip model + hub + detail template (Places, Itinerary, Flights & Stay, Expenses, Emergency)
    loyalty/             loyalty programs + preferred cards
    settings/            theme, family, lock, sync, backup
    share/               public read-only itinerary page
  data/seed.ts           Singapore example — the reference for the reusable Trip model
```

## Adding a new destination
No code needed: press **+ New Trip**, or add a record shaped like `data/seed.ts`. The detail page (`features/trips/TripDetailPage.tsx`) renders any `Trip` and its child tables.

## Adding a new feature module
1. Create `src/features/<name>/` with `types.ts`, hooks (Dexie live queries) and pages.
2. If it needs persistence, add a table in `lib/db.ts` (bump `version`) and to `SYNCED_TABLES` — sync and backup pick it up automatically.
3. Register a route in `App.tsx` and a nav item in `app/AppShell.tsx`.

## Security model
- Sensitive fields (`numberEnc`, `insurancePolicyEnc`) are encrypted client-side; Firestore never sees plaintext.
- The PIN is never stored; only a salt + verifier. Losing the PIN means encrypted fields are unrecoverable (by design).
- Biometric unlock = WebAuthn assertion gates unwrapping the master key with a non-extractable device key.
- Published itineraries exclude documents, confirmations, and ID numbers.

## Environment
See `.env.example`. Without Firebase keys the app is fully functional in local-only mode.
