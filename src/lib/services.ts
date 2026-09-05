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
  actualDepart?: string;
  actualArrive?: string;
  gate?: string;
  terminal?: string;
  delayMins?: number;
  fetchedAt: number;
}

/** Without an API key we estimate the phase from the scheduled times; with AeroDataBox (RapidAPI) we return live data. */
export async function fetchFlightStatus(f: Flight): Promise<FlightLive> {
  const key = import.meta.env.VITE_AERODATABOX_KEY;
  if (key) {
    try {
      const date = f.departAt.slice(0, 10);
      const r = await fetch(`https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(f.flightNumber)}/${date}?withAircraftImage=false&withLocation=false`, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": "aerodatabox.p.rapidapi.com" },
      });
      if (r.ok) {
        const arr = await r.json();
        const leg = Array.isArray(arr) ? arr[0] : null;
        if (leg) {
          const s = String(leg.status ?? "").toLowerCase();
          const status: LiveFlightStatus = s.includes("cancel")
            ? "cancelled"
            : s.includes("delay")
              ? "delayed"
              : s.includes("arrived") || s.includes("landed")
                ? "landed"
                : s.includes("departed") || s.includes("enroute") || s.includes("en route")
                  ? "departed"
                  : s.includes("boarding")
                    ? "boarding"
                    : "scheduled";
          const live: FlightLive = {
            status,
            source: "aerodatabox",
            scheduledDepart: leg.departure?.scheduledTime?.local,
            scheduledArrive: leg.arrival?.scheduledTime?.local,
            actualDepart: leg.departure?.actualTime?.local,
            actualArrive: leg.arrival?.actualTime?.local,
            gate: leg.departure?.gate,
            terminal: leg.departure?.terminal,
            fetchedAt: Date.now(),
          };
          await setSetting(`fl:${f.id}`, live);
          return live;
        }
      }
    } catch {
      const cached = await getSetting<FlightLive | null>(`fl:${f.id}`, null);
      if (cached) return cached;
    }
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
