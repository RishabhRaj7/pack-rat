# Pack Rat — architecture notes

Offline-first PWA for trip planning + an encrypted family document vault.
Stack: React 19 · Vite · Tailwind v4 (Material You tonal palette) · Dexie (IndexedDB) · Firebase (optional) · dnd-kit · Open-Meteo · open.er-api / Frankfurter (FX) · adsbdb (flight number → airline + route).

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
    services.ts          weather, packing suggestions, FX rates (160+ currencies, cached), flight status,
                         flight-number lookup (airline, logo, origin/destination), train operator detection, geocoding
    search.ts            smart search: accent/typo tolerant, tokenized, weighted fields, month/year + status words
    prefs.ts             home currency + live rate hooks shared by Expenses, Converter and Home
    theme.ts             light / dark (tonal, not pure black) / system
  components/            ui.tsx (M3-style design system), icons.tsx (Lucide registry — no emojis), attachments.tsx
  features/
    lock/                LockProvider (in-memory key, auto-lock), LockScreen, SecretField
    family/              members + profile page
    documents/           ID vault: form, card, search, expiry logic
    trips/               Trip model + hub (Trips / Flights / Trains views) + detail template
                         (Places, Itinerary, Travel & Stay, Expenses, Emergency)
    journeys/            FlightCard / TrainCard + forms shared by trips and the standalone (ad-hoc, tripId "") views
    convert/             currency converter (swap, quick amounts, recent pairs, offline cache)
    loyalty/             loyalty programs + preferred cards (route kept, hidden from navigation for now)
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
- The AES key is derived from the PIN alone (PBKDF2, 310k iterations, fixed app-wide salt), so entering the
  same PIN on any device yields the same key — there is no per-device key and nothing to "merge".
- The PIN is never stored or synced; the cloud only holds a verifier (AES-GCM of a constant) so a new device can
  check the PIN before it starts encrypting, plus the list of legacy per-device salts (public, non-secret).
- Devices still on the old per-device salt are migrated on their next PIN unlock: old ciphertext is re-encrypted with
  the shared key and pushed; old keys are kept in memory as read fallbacks for records that arrive later.
- Losing the PIN means encrypted fields are unrecoverable (by design).
- Biometric unlock = WebAuthn assertion gates unwrapping the master key with a non-extractable device key.
- Published itineraries exclude documents, confirmations, and ID numbers.

## Environment
See `.env.example`. Without Firebase keys the app is fully functional in local-only mode.

## Flights: live times & 7-day averages
With `VITE_AERODATABOX_KEY` set, `FlightCard` shows scheduled vs. actual (or airline-revised) times — the original is
struck through and the new time is green when early, orange when late, red when 30+ min late — plus a strip with the
average departure / arrival and on-time % over the last 7 days (`fetchFlightHistory`, AeroDataBox range endpoint with a
per-day fallback, cached 12 h in the `settings` table). Without the key the card falls back to the manual times and an
estimated phase, as before.

## Per-person view & optional trains
- `focusMembers` (settings table, per device): the "Viewing for" chips on Home filter trips (travellers), flights / trains
  (passengers), stays & expenses (via the trip) and documents to the chosen people. Empty = everyone. The Trips hub honours
  the same preference and shows a clearable banner.
- `trainsEnabled` (settings table, per device): hides the Trains tab and the Trains section inside trips. Trains are
  always listed last. Toggle from the Trips page or Settings.
- Dark theme is AMOLED (true `#000` background, near-black surfaces).

## Trains
No open, key-less global train API exists (each operator has its own, mostly behind keys), so train
journeys are entered manually. The operator is inferred from the number format (e.g. 5 digits → Indian
Railways, with a live-status deep link). The `trains` table (Dexie v3) syncs like every other table —
if you use custom Firestore rules, make sure `users/{uid}/trains/{doc}` is allowed.
