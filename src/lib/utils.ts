import { format, parseISO, differenceInCalendarDays, eachDayOfInterval } from "date-fns";
export { cn } from "@/utils/cn";

export const fmtDate = (d?: string, f = "d MMM yyyy") => (d ? format(parseISO(d), f) : "—");
export const fmtDateTime = (d?: string) => (d ? format(parseISO(d), "EEE d MMM · HH:mm") : "—");
export const fmtTime = (d?: string) => (d ? format(parseISO(d), "HH:mm") : "—");
export const today = () => new Date().toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => differenceInCalendarDays(parseISO(b), parseISO(a));
export const dateRange = (a: string, b: string) => eachDayOfInterval({ start: parseISO(a), end: parseISO(b) }).map((d) => format(d, "yyyy-MM-dd"));

export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = ["#0B5D67", "#0F8A8B", "#3F7D9B", "#7A5C9E", "#B5493B", "#D08A1D", "#4E8A5B", "#8A5A44"];
export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function mapsUrl(opts: { name?: string; address?: string; lat?: number; lng?: number }) {
  if (opts.lat != null && opts.lng != null) {
    const q = encodeURIComponent(opts.name ?? "");
    return `https://www.google.com/maps/search/?api=1&query=${opts.lat},${opts.lng}${q ? `&query_place_id=&q=${q}` : ""}`;
  }
  const q = encodeURIComponent([opts.name, opts.address].filter(Boolean).join(", "));
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
export function mapsDirectionsUrl(opts: { address?: string; lat?: number; lng?: number; name?: string }) {
  const dest = opts.lat != null && opts.lng != null ? `${opts.lat},${opts.lng}` : encodeURIComponent([opts.name, opts.address].filter(Boolean).join(", "));
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function fmtMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const r = await fetch(dataUrl);
  return r.blob();
}

export const flag = (cc: string) =>
  cc && cc.length === 2 ? String.fromCodePoint(...cc.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🌍";

export interface Country {
  code: string;
  name: string;
  currency: string;
}
export const COUNTRIES: Country[] = [
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "AT", name: "Austria", currency: "EUR" },
  { code: "BE", name: "Belgium", currency: "EUR" },
  { code: "BR", name: "Brazil", currency: "BRL" },
  { code: "CA", name: "Canada", currency: "CAD" },
  { code: "CH", name: "Switzerland", currency: "CHF" },
  { code: "CN", name: "China", currency: "CNY" },
  { code: "CZ", name: "Czechia", currency: "CZK" },
  { code: "DE", name: "Germany", currency: "EUR" },
  { code: "DK", name: "Denmark", currency: "DKK" },
  { code: "EG", name: "Egypt", currency: "EGP" },
  { code: "ES", name: "Spain", currency: "EUR" },
  { code: "FI", name: "Finland", currency: "EUR" },
  { code: "FR", name: "France", currency: "EUR" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "GR", name: "Greece", currency: "EUR" },
  { code: "HK", name: "Hong Kong", currency: "HKD" },
  { code: "HU", name: "Hungary", currency: "HUF" },
  { code: "ID", name: "Indonesia", currency: "IDR" },
  { code: "IE", name: "Ireland", currency: "EUR" },
  { code: "IL", name: "Israel", currency: "ILS" },
  { code: "IN", name: "India", currency: "INR" },
  { code: "IS", name: "Iceland", currency: "ISK" },
  { code: "IT", name: "Italy", currency: "EUR" },
  { code: "JP", name: "Japan", currency: "JPY" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "KR", name: "South Korea", currency: "KRW" },
  { code: "LK", name: "Sri Lanka", currency: "LKR" },
  { code: "MA", name: "Morocco", currency: "MAD" },
  { code: "MV", name: "Maldives", currency: "MVR" },
  { code: "MX", name: "Mexico", currency: "MXN" },
  { code: "MY", name: "Malaysia", currency: "MYR" },
  { code: "NL", name: "Netherlands", currency: "EUR" },
  { code: "NO", name: "Norway", currency: "NOK" },
  { code: "NP", name: "Nepal", currency: "NPR" },
  { code: "NZ", name: "New Zealand", currency: "NZD" },
  { code: "PH", name: "Philippines", currency: "PHP" },
  { code: "PL", name: "Poland", currency: "PLN" },
  { code: "PT", name: "Portugal", currency: "EUR" },
  { code: "QA", name: "Qatar", currency: "QAR" },
  { code: "SA", name: "Saudi Arabia", currency: "SAR" },
  { code: "SE", name: "Sweden", currency: "SEK" },
  { code: "TH", name: "Thailand", currency: "THB" },
  { code: "TR", name: "Türkiye", currency: "TRY" },
  { code: "TW", name: "Taiwan", currency: "TWD" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "VN", name: "Vietnam", currency: "VND" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
].sort((a, b) => a.name.localeCompare(b.name));

export const countryName = (code: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code;
export const CURRENCIES = Array.from(new Set(COUNTRIES.map((c) => c.currency))).sort();
