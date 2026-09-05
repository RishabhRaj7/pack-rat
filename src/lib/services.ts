/**
 * External data services. All are cached in IndexedDB `settings` so the last known values
 * render offline (the service worker additionally caches the raw HTTP responses).
 */
import { getSetting, setSetting } from "./db";
import type { Flight } from "@/features/trips/types";

/* ---------------- Weather (Open-Meteo, no key) ---------------- */
export interface DayForecast {
  date: string;
  tMax: number;
  tMin: number;
  precipProb: number;
  precipMm: number;
  uv: number;
  windMax: number;
  code: number;
}

export function weatherLabel(code: number): { label: string } {
  if (code === 0) return { label: "Clear" };
  if (code <= 2) return { label: "Partly cloudy" };
  if (code === 3) return { label: "Overcast" };
  if (code <= 49) return { label: "Foggy" };
  if (code <= 59) return { label: "Drizzle" };
  if (code <= 69) return { label: "Rain" };
  if (code <= 79) return { label: "Snow" };
  if (code <= 84) return { label: "Showers" };
  if (code <= 94) return { label: "Snow showers" };
  return { label: "Thunderstorm" };
}

export async function fetchForecast(lat: number, lng: number, timezone = "auto"): Promise<{ days: DayForecast[]; fetchedAt: number; stale: boolean }> {
  const cacheKey = `wx:${lat.toFixed(2)},${lng.toFixed(2)}`;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,wind_speed_10m_max&forecast_days=16&timezone=${encodeURIComponent(timezone)}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error("weather");
    const j = await r.json();
    if (j.offline) throw new Error("offline");
    const d = j.daily;
    const days: DayForecast[] = d.time.map((date: string, i: number) => ({
      date,
      tMax: d.temperature_2m_max[i],
      tMin: d.temperature_2m_min[i],
      precipProb: d.precipitation_probability_max[i] ?? 0,
      precipMm: d.precipitation_sum[i] ?? 0,
      uv: d.uv_index_max[i] ?? 0,
      windMax: d.wind_speed_10m_max[i] ?? 0,
      code: d.weather_code[i],
    }));
    const val = { days, fetchedAt: Date.now() };
    await setSetting(cacheKey, val);
    return { ...val, stale: false };
  } catch {
    const cached = await getSetting<{ days: DayForecast[]; fetchedAt: number } | null>(cacheKey, null);
    if (cached) return { ...cached, stale: true };
    throw new Error("Forecast unavailable offline");
  }
}

export function packingSuggestions(f: DayForecast): string[] {
  const out: string[] = [];
  if (f.precipProb >= 60 || f.precipMm >= 5) out.push("Compact umbrella or rain jacket — high chance of rain");
  else if (f.precipProb >= 30) out.push("Small umbrella just in case");
  if (f.tMax >= 32) out.push("Reusable water bottle & electrolytes — it's going to be hot");
  if (f.tMax >= 28) out.push("Light, breathable clothing; linen or dry-fit");
  if (f.tMin <= 10) out.push("Warm layer / jacket for the morning and evening");
  else if (f.tMin <= 18) out.push("Light sweater for air-conditioned or evening spots");
  if (f.uv >= 8) out.push("SPF 50+, sunglasses and a hat — very high UV");
  else if (f.uv >= 5) out.push("Sunscreen and sunglasses");
  if (f.windMax >= 35) out.push("Windy — skip the loose hat, secure bags");
  if (f.code >= 95) out.push("Thunderstorms likely — plan indoor backups");
  out.push("Comfortable walking shoes");
  if (f.tMax >= 28 && f.precipProb >= 40) out.push("Spare socks / quick-dry footwear — humid & wet");
  return out;
}

/* ---------------- Currency ----------------
 * Primary: open.er-api.com (160+ currencies, refreshed daily, no key).
 * Fallback: Frankfurter (ECB reference rates). Last good response is cached in IndexedDB.
 */
export interface RateTable {
  base: string;
  rates: Record<string, number>;
  date: string; // YYYY-MM-DD of the rate snapshot
  fetchedAt: number;
  stale: boolean;
  provider: "exchangerate-api" | "frankfurter" | "cache" | "none";
}

const FX_TTL = 30 * 60_000; // re-use an in-memory/IndexedDB copy for 30 minutes
const fxMem = new Map<string, RateTable>();

export async function fetchRates(base: string, force = false): Promise<RateTable> {
  base = base.toUpperCase();
  const cacheKey = `fx:${base}`;
  const mem = fxMem.get(base);
  if (!force && mem && Date.now() - mem.fetchedAt < FX_TTL) return mem;
  const cached = await getSetting<RateTable | null>(cacheKey, null);
  if (!force && cached && Date.now() - cached.fetchedAt < FX_TTL) {
    const v = { ...cached, stale: false };
    fxMem.set(base, v);
    return v;
  }
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!r.ok) throw new Error("fx");
    const j = await r.json();
    if (j.result !== "success" || !j.rates) throw new Error("fx");
    const val: RateTable = { base, rates: { ...j.rates, [base]: 1 }, date: new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10), fetchedAt: Date.now(), stale: false, provider: "exchangerate-api" };
    await setSetting(cacheKey, val);
    fxMem.set(base, val);
    return val;
  } catch {
    /* try fallback */
  }
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${base}`);
    if (!r.ok) throw new Error("fx");
    const j = await r.json();
    if (!j.rates) throw new Error("fx");
    const val: RateTable = { base, rates: { ...j.rates, [base]: 1 }, date: j.date as string, fetchedAt: Date.now(), stale: false, provider: "frankfurter" };
    await setSetting(cacheKey, val);
    fxMem.set(base, val);
    return val;
  } catch {
    /* offline */
  }
  if (cached) return { ...cached, stale: true, provider: "cache" };
  return { base, rates: { [base]: 1 }, date: "", fetchedAt: 0, stale: true, provider: "none" };
}

/** Convert using a rate table whose base may differ from `from`. Returns null if either currency is unknown. */
export function convertWith(table: RateTable | null | undefined, amount: number, from: string, to: string): number | null {
  if (!table) return null;
  if (from === to) return amount;
  const rf = table.rates[from];
  const rt = table.rates[to];
  if (!rf || !rt) return null;
  return (amount / rf) * rt;
}

/** Currency metadata for pickers. Names via Intl.DisplayNames when available. */
export const POPULAR_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "SGD", "AED", "AUD", "CAD", "CHF", "CNY", "THB", "MYR", "IDR", "VND", "KRW", "HKD", "NZD", "SAR", "QAR", "TRY", "ZAR", "MXN", "BRL", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "ILS", "EGP", "LKR", "NPR", "PHP", "TWD", "MVR", "MAD", "KES", "ISK", "BDT", "PKR", "OMR", "KWD", "BHD", "TZS", "GEL", "RUB", "ARS", "CLP", "COP", "PEN"];
export function currencyName(code: string): string {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat(undefined, { style: "currency", currency: code, currencyDisplay: "narrowSymbol" }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/* ---------------- Flight status ---------------- */
export type LiveFlightStatus = "scheduled" | "boarding" | "departed" | "landed" | "delayed" | "cancelled" | "unknown";
export interface FlightLive {
  status: LiveFlightStatus;
  source: "aerodatabox" | "estimated";
  scheduledDepart?: string;
  scheduledArrive?: string;
  /** Actual (runway / gate) time once it happened; otherwise the airline's revised estimate if it differs. */
  actualDepart?: string;
  actualArrive?: string;
  /** True when actualX is a revised estimate rather than a real off/on-block time. */
  departIsEstimate?: boolean;
  arriveIsEstimate?: boolean;
  gate?: string;
  terminal?: string;
  delayMins?: number;
  fetchedAt: number;
}

/** Local ISO string from an AeroDataBox time object ({ local: "2025-11-03 09:40+08:00" } or a plain string). */
const adbLocal = (t: unknown): string | undefined => {
  const raw = typeof t === "string" ? t : (t as { local?: string } | undefined)?.local;
  if (!raw) return undefined;
  // "2025-11-03 09:40+08:00" → "2025-11-03T09:40"
  return raw.slice(0, 16).replace(" ", "T");
};

/** Minutes between two local ISO datetimes (b − a). */
export const minutesDiff = (a?: string, b?: string) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60_000) : undefined);

export const HAS_FLIGHT_DATA_KEY = !!import.meta.env.VITE_AERODATABOX_KEY;

/** True when the app can show real (rather than estimated) flight data. */
export function hasFlightDataKey() {
  return HAS_FLIGHT_DATA_KEY;
}

type AdbLeg = {
  status?: string;
  departure?: { scheduledTime?: unknown; revisedTime?: unknown; runwayTime?: unknown; predictedTime?: unknown; gate?: string; terminal?: string };
  arrival?: { scheduledTime?: unknown; revisedTime?: unknown; runwayTime?: unknown; predictedTime?: unknown; gate?: string; terminal?: string };
};

/** Best-known times for a leg: scheduled + (actual | revised estimate). */
function legTimes(leg: AdbLeg) {
  const sd = adbLocal(leg.departure?.scheduledTime);
  const sa = adbLocal(leg.arrival?.scheduledTime);
  const runD = adbLocal(leg.departure?.runwayTime);
  const runA = adbLocal(leg.arrival?.runwayTime);
  const revD = adbLocal(leg.departure?.revisedTime) ?? adbLocal(leg.departure?.predictedTime);
  const revA = adbLocal(leg.arrival?.revisedTime) ?? adbLocal(leg.arrival?.predictedTime);
  return {
    scheduledDepart: sd,
    scheduledArrive: sa,
    actualDepart: runD ?? revD,
    actualArrive: runA ?? revA,
    departIsEstimate: !runD && !!revD,
    arriveIsEstimate: !runA && !!revA,
  };
}

function parseAdbStatus(raw: unknown): LiveFlightStatus {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("cancel")) return "cancelled";
  if (s.includes("delay")) return "delayed";
  if (s.includes("arrived") || s.includes("landed")) return "landed";
  if (s.includes("departed") || s.includes("enroute") || s.includes("en route")) return "departed";
  if (s.includes("boarding")) return "boarding";
  return "scheduled";
}

const adbHeaders = (key: string) => ({ "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" });

/* ---------------- 7-day history (average departure / arrival) ---------------- */
export interface FlightDaySample {
  date: string; // YYYY-MM-DD (local departure date)
  scheduledDepart?: string;
  scheduledArrive?: string;
  actualDepart?: string;
  actualArrive?: string;
  status: LiveFlightStatus;
}
export interface FlightHistory {
  flightNumber: string;
  from: string; // window start (YYYY-MM-DD)
  to: string; // window end
  samples: FlightDaySample[];
  /** Average actual departure / arrival clock time (HH:mm) across days that operated. */
  avgDepart?: string;
  avgArrive?: string;
  /** Average delay in minutes vs. schedule (negative = early). */
  avgDepartDelay?: number;
  avgArriveDelay?: number;
  onTimePct?: number; // arrivals within 15 min of schedule
  fetchedAt: number;
}

const HISTORY_TTL = 12 * 60 * 60 * 1000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const hhmm = (mins: number) => {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const minsOfDay = (iso: string) => new Date(iso).getHours() * 60 + new Date(iso).getMinutes();

function summarise(flightNumber: string, from: string, to: string, samples: FlightDaySample[]): FlightHistory {
  const dep = samples.filter((s) => s.actualDepart && s.scheduledDepart && s.status !== "cancelled");
  const arr = samples.filter((s) => s.actualArrive && s.scheduledArrive && s.status !== "cancelled");
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
  const depDelay = avg(dep.map((s) => minutesDiff(s.scheduledDepart, s.actualDepart)!));
  const arrDelay = avg(arr.map((s) => minutesDiff(s.scheduledArrive, s.actualArrive)!));
  // Average clock time = mean scheduled clock time + mean delay (avoids midnight wrap-around artefacts).
  const depBase = avg(dep.map((s) => minsOfDay(s.scheduledDepart!)));
  const arrBase = avg(arr.map((s) => minsOfDay(s.scheduledArrive!)));
  const onTime = arr.filter((s) => minutesDiff(s.scheduledArrive, s.actualArrive)! <= 15).length;
  return {
    flightNumber,
    from,
    to,
    samples,
    avgDepart: depBase != null && depDelay != null ? hhmm(depBase + depDelay) : undefined,
    avgArrive: arrBase != null && arrDelay != null ? hhmm(arrBase + arrDelay) : undefined,
    avgDepartDelay: depDelay != null ? Math.round(depDelay) : undefined,
    avgArriveDelay: arrDelay != null ? Math.round(arrDelay) : undefined,
    onTimePct: arr.length ? Math.round((onTime / arr.length) * 100) : undefined,
    fetchedAt: Date.now(),
  };
}

/**
 * Average departure / arrival across the last 7 days (yesterday back to 7 days ago).
 * Uses the AeroDataBox range endpoint (one call); falls back to per-day calls if the plan doesn't allow ranges.
 * Cached for 12 h in IndexedDB. Returns null without an API key.
 */
export async function fetchFlightHistory(flightNumber: string, force = false): Promise<FlightHistory | null> {
  const key = import.meta.env.VITE_AERODATABOX_KEY;
  if (!key) return null;
  const num = flightNumber.replace(/\s+/g, "").toUpperCase();
  const cacheKey = `flh:${num}`;
  const cached = await getSetting<FlightHistory | null>(cacheKey, null);
  if (cached && !force && Date.now() - cached.fetchedAt < HISTORY_TTL) return cached;

  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const from = isoDay(start);
  const to = isoDay(end);

  const toSample = (leg: AdbLeg): FlightDaySample => {
    const t = legTimes(leg);
    return { date: (t.scheduledDepart ?? "").slice(0, 10), ...t, status: parseAdbStatus(leg.status) };
  };

  try {
    let legs: AdbLeg[] | null = null;
    const r = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${from}/${to}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, { headers: adbHeaders(key) });
    if (r.ok) {
      const j = await r.json();
      legs = Array.isArray(j) ? j : null;
    }
    if (!legs) {
      // Per-day fallback (7 small requests).
      const days: string[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) days.push(isoDay(d));
      const results = await Promise.all(
        days.map(async (d) => {
          try {
            const rr = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(num)}/${d}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, { headers: adbHeaders(key) });
            if (!rr.ok) return [];
            const jj = await rr.json();
            return Array.isArray(jj) ? (jj as AdbLeg[]) : [];
          } catch {
            return [];
          }
        })
      );
      legs = results.flat();
    }
    // One sample per day (first leg of that date); ignore legs without a scheduled departure.
    const byDay = new Map<string, FlightDaySample>();
    legs.map(toSample).filter((s) => s.date).forEach((s) => { if (!byDay.has(s.date)) byDay.set(s.date, s); });
    const samples = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
    const hist = summarise(num, from, to, samples);
    await setSetting(cacheKey, hist);
    return hist;
  } catch {
    return cached;
  }
}

/** Without an API key we estimate the phase from the scheduled times; with AeroDataBox (RapidAPI) we return live data. */
export async function fetchFlightStatus(f: Flight): Promise<FlightLive> {
  const key = import.meta.env.VITE_AERODATABOX_KEY;
  if (key) {
    try {
      const date = f.departAt.slice(0, 10);
      const r = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(f.flightNumber)}/${date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false`, {
        headers: adbHeaders(key),
      });
      if (r.ok) {
        const arr = await r.json();
        const leg: AdbLeg | null = Array.isArray(arr) ? arr[0] : null;
        if (leg) {
          const times = legTimes(leg);
          let status = parseAdbStatus(leg.status);
          const delay = minutesDiff(times.scheduledDepart, times.actualDepart);
          if (status === "scheduled" && delay != null && delay >= 15) status = "delayed";
          const live: FlightLive = {
            status,
            source: "aerodatabox",
            ...times,
            gate: leg.departure?.gate,
            terminal: leg.departure?.terminal,
            delayMins: delay,
            fetchedAt: Date.now(),
          };
          await setSetting(`fl:${f.id}`, live);
          return live;
        }
      }
    } catch {
      /* fall through to cache / estimate */
    }
    const cached = await getSetting<FlightLive | null>(`fl:${f.id}`, null);
    if (cached) return cached;
  }
  const now = Date.now();
  const dep = new Date(f.departAt).getTime();
  const arr = new Date(f.arriveAt).getTime();
  let status: LiveFlightStatus = "scheduled";
  if (now > arr) status = "landed";
  else if (now > dep) status = "departed";
  else if (dep - now < 60 * 60 * 1000) status = "boarding";
  return { status, source: "estimated", fetchedAt: now };
}

export const flightTrackerUrl = (flightNumber: string) => `https://www.flightradar24.com/data/flights/${flightNumber.toLowerCase().replace(/\s+/g, "")}`;

/* ---------------- Flight number → airline + route (adsbdb, no key) ---------------- */
export interface FlightRouteInfo {
  flightNumber: string;
  airlineCode?: string; // IATA
  airlineName?: string;
  from?: string; // IATA
  fromName?: string;
  fromCity?: string;
  to?: string;
  toName?: string;
  toCity?: string;
}

/** Split "SQ 423" / "sq423" / "6E1234" into IATA prefix + number. */
export function parseFlightNumber(input: string): { code: string; number: string; normalized: string } | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = raw.match(/^([A-Z0-9]{2}|[A-Z]{3})(\d{1,4})([A-Z]?)$/);
  if (!m) return null;
  return { code: m[1], number: m[2], normalized: `${m[1]}${m[2]}${m[3]}` };
}

/** Airline logo (IATA) from the public avs.io / kiwi CDN. Returns null if the code is missing. */
export const airlineLogoUrl = (iata?: string, size: 32 | 64 = 64) => (iata && /^[A-Z0-9]{2}$/.test(iata) ? `https://images.kiwi.com/airlines/${size}/${iata}.png` : null);

/** Small offline fallback so common airlines resolve even without network. */
export const AIRLINES: Record<string, string> = {
  AI: "Air India", "6E": "IndiGo", UK: "Vistara", SG: "SpiceJet", QP: "Akasa Air", IX: "Air India Express", G8: "Go First",
  SQ: "Singapore Airlines", TR: "Scoot", MH: "Malaysia Airlines", AK: "AirAsia", D7: "AirAsia X", TG: "Thai Airways", FD: "Thai AirAsia", VN: "Vietnam Airlines", VJ: "VietJet Air",
  CX: "Cathay Pacific", JL: "Japan Airlines", NH: "All Nippon Airways", KE: "Korean Air", OZ: "Asiana Airlines", CI: "China Airlines", BR: "EVA Air", GA: "Garuda Indonesia", PR: "Philippine Airlines",
  EK: "Emirates", EY: "Etihad Airways", QR: "Qatar Airways", SV: "Saudia", GF: "Gulf Air", WY: "Oman Air", FZ: "flydubai", TK: "Turkish Airlines",
  BA: "British Airways", LH: "Lufthansa", AF: "Air France", KL: "KLM", LX: "SWISS", OS: "Austrian", IB: "Iberia", AZ: "ITA Airways", SK: "SAS", AY: "Finnair", EI: "Aer Lingus", VS: "Virgin Atlantic", FR: "Ryanair", U2: "easyJet", W6: "Wizz Air", TP: "TAP Air Portugal", LO: "LOT Polish Airlines",
  AA: "American Airlines", DL: "Delta Air Lines", UA: "United Airlines", WN: "Southwest", B6: "JetBlue", AS: "Alaska Airlines", AC: "Air Canada", WS: "WestJet", AM: "Aeroméxico",
  QF: "Qantas", VA: "Virgin Australia", JQ: "Jetstar", NZ: "Air New Zealand", ET: "Ethiopian Airlines", KQ: "Kenya Airways", SA: "South African Airways", MS: "EgyptAir", LA: "LATAM", AV: "Avianca", CM: "Copa Airlines", UL: "SriLankan Airlines", RA: "Nepal Airlines", BG: "Biman Bangladesh", PK: "Pakistan International", CA: "Air China", MU: "China Eastern", CZ: "China Southern", HU: "Hainan Airlines", "3K": "Jetstar Asia", OD: "Batik Air Malaysia", QZ: "Indonesia AirAsia", Q2: "Maldivian",
};

export async function lookupFlightRoute(flightNumber: string): Promise<FlightRouteInfo | null> {
  const parsed = parseFlightNumber(flightNumber);
  if (!parsed) return null;
  const fallback: FlightRouteInfo = { flightNumber: parsed.normalized, airlineCode: parsed.code.length === 2 ? parsed.code : undefined, airlineName: AIRLINES[parsed.code] };
  const cacheKey = `route:${parsed.normalized}`;
  try {
    const r = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(parsed.normalized)}`);
    if (!r.ok) throw new Error("route");
    const j = await r.json();
    const fr = j?.response?.flightroute;
    if (!fr) throw new Error("route");
    const info: FlightRouteInfo = {
      flightNumber: parsed.normalized,
      airlineCode: fr.airline?.iata ?? fallback.airlineCode,
      airlineName: fr.airline?.name ?? fallback.airlineName,
      from: fr.origin?.iata_code,
      fromName: fr.origin?.name,
      fromCity: fr.origin?.municipality,
      to: fr.destination?.iata_code,
      toName: fr.destination?.name,
      toCity: fr.destination?.municipality,
    };
    await setSetting(cacheKey, info);
    return info;
  } catch {
    const cached = await getSetting<FlightRouteInfo | null>(cacheKey, null);
    return cached ?? fallback;
  }
}

/* ---------------- Trains ----------------
 * There is no free, global, key-less train schedule API (national operators each have their own,
 * mostly behind keys), so train journeys are entered manually. We still resolve the operator
 * from the train number format and provide a live-status deep link where one exists.
 */
export function guessTrainOperator(trainNumber: string): { operator?: string; statusUrl?: string } {
  const n = trainNumber.trim().toUpperCase();
  if (/^\d{5}$/.test(n)) return { operator: "Indian Railways", statusUrl: `https://www.railyatri.in/live-train-status/${n}` };
  if (/^(ICE|IC|EC|RE|RB|S)\s?\d+/.test(n)) return { operator: "Deutsche Bahn", statusUrl: `https://www.bahn.de/` };
  if (/^(TGV|OUIGO|TER|INTERCITES)\s?\d*/.test(n)) return { operator: "SNCF", statusUrl: "https://www.sncf-connect.com/" };
  if (/^(NOZOMI|HIKARI|KODAMA|HAYABUSA|SAKURA|MIZUHO)/.test(n)) return { operator: "JR Shinkansen" };
  if (/^(EUROSTAR|ES)\s?\d+/.test(n)) return { operator: "Eurostar", statusUrl: "https://www.eurostar.com/" };
  if (/^(FR|FA|FB|ITA)\s?\d+/.test(n)) return { operator: "Trenitalia / Italo" };
  if (/^(AVE|ALVIA|AVLO)\s?\d*/.test(n)) return { operator: "Renfe" };
  if (/^(G|D|C|K|Z|T)\d{1,4}$/.test(n)) return { operator: "China Railway" };
  if (/^(KTX|SRT)\s?\d+/.test(n)) return { operator: "Korail" };
  if (/^(AMTRAK|)\d{1,4}$/.test(n)) return { operator: undefined };
  return {};
}

/* ---------------- Geocoding (Nominatim) ---------------- */
export async function geocode(q: string): Promise<{ lat: number; lng: number; display: string } | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" } });
    const j = await r.json();
    if (Array.isArray(j) && j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), display: j[0].display_name };
  } catch {
    /* ignore */
  }
  return null;
}
