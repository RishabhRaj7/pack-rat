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

export function weatherLabel(code: number): { label: string; emoji: string } {
  if (code === 0) return { label: "Clear", emoji: "☀️" };
  if (code <= 2) return { label: "Partly cloudy", emoji: "🌤️" };
  if (code === 3) return { label: "Overcast", emoji: "☁️" };
  if (code <= 49) return { label: "Foggy", emoji: "🌫️" };
  if (code <= 59) return { label: "Drizzle", emoji: "🌦️" };
  if (code <= 69) return { label: "Rain", emoji: "🌧️" };
  if (code <= 79) return { label: "Snow", emoji: "🌨️" };
  if (code <= 84) return { label: "Showers", emoji: "🌧️" };
  if (code <= 94) return { label: "Snow showers", emoji: "🌨️" };
  return { label: "Thunderstorm", emoji: "⛈️" };
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
  if (f.precipProb >= 60 || f.precipMm >= 5) out.push("☔ Compact umbrella or rain jacket — high chance of rain");
  else if (f.precipProb >= 30) out.push("🌂 Small umbrella just in case");
  if (f.tMax >= 32) out.push("🥤 Reusable water bottle & electrolytes — it's going to be hot");
  if (f.tMax >= 28) out.push("👕 Light, breathable clothing; linen or dry-fit");
  if (f.tMin <= 10) out.push("🧥 Warm layer / jacket for the morning and evening");
  else if (f.tMin <= 18) out.push("🧶 Light sweater for air-conditioned or evening spots");
  if (f.uv >= 8) out.push("🧴 SPF 50+, sunglasses and a hat — very high UV");
  else if (f.uv >= 5) out.push("🕶️ Sunscreen and sunglasses");
  if (f.windMax >= 35) out.push("💨 Windy — skip the loose hat, secure bags");
  if (f.code >= 95) out.push("⛈️ Thunderstorms likely — plan indoor backups");
  out.push("👟 Comfortable walking shoes");
  if (f.tMax >= 28 && f.precipProb >= 40) out.push("🧦 Spare socks / quick-dry footwear — humid & wet");
  return out;
}

/* ---------------- Currency (Frankfurter, no key) ---------------- */
export async function fetchRates(base: string): Promise<{ rates: Record<string, number>; date: string; stale: boolean }> {
  const cacheKey = `fx:${base}`;
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${base}`);
    if (!r.ok) throw new Error("fx");
    const j = await r.json();
    if (j.offline || !j.rates) throw new Error("offline");
    const val = { rates: { ...j.rates, [base]: 1 }, date: j.date as string };
    await setSetting(cacheKey, val);
    return { ...val, stale: false };
  } catch {
    const cached = await getSetting<{ rates: Record<string, number>; date: string } | null>(cacheKey, null);
    if (cached) return { ...cached, stale: true };
    return { rates: { [base]: 1 }, date: "", stale: true };
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
  const key = process.env.NEXT_PUBLIC_AERODATABOX_KEY;
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
