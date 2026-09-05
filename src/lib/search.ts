/**
 * Smart search: accent-insensitive, tokenized, typo-tolerant, with per-field weights.
 *
 *  - "singapor"        → Singapore (prefix / fuzzy)
 *  - "sq423" / "SQ 423" → matches flight number regardless of spacing
 *  - "nov 2025"        → matches trips / journeys whose dates fall in that month
 *  - "upcoming tokyo"  → status words are understood as filters
 *  - multiple words are AND-ed; each must match at least one field.
 */

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const compact = (s: string) => normalize(s).replace(/\s/g, "");

/** Damerau-Levenshtein bounded at 2 for speed. */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return dp[a.length][b.length];
}

/** Score how well a single query token matches a single field value (0 = no match). */
function tokenScore(token: string, value: string): number {
  if (!token || !value) return 0;
  const v = normalize(value);
  if (!v) return 0;
  if (v === token) return 10;
  if (compact(value) === token) return 9;
  const words = v.split(" ");
  if (words.some((w) => w === token)) return 8;
  if (words.some((w) => w.startsWith(token))) return 6;
  if (compact(value).includes(token)) return 5;
  if (v.includes(token)) return 5;
  // initials / acronym: "gbtb" → "Gardens by the Bay"
  if (token.length >= 2 && words.map((w) => w[0]).join("").includes(token)) return 3;
  // typo tolerance for tokens of 4+ chars
  if (token.length >= 4) {
    const max = token.length >= 7 ? 2 : 1;
    if (words.some((w) => w.length >= 3 && editDistance(token, w, max) <= max)) return 4;
    if (words.some((w) => w.length > token.length && editDistance(token, w.slice(0, token.length), max) <= max)) return 2;
  }
  return 0;
}

export interface SearchField {
  value: string | undefined | null | (string | undefined | null)[];
  weight?: number; // default 1
}

/** Returns a relevance score (0 = no match). Every token must match at least one field. */
export function scoreItem(query: string, fields: SearchField[]): number {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return 1;
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const f of fields) {
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      for (const v of vals) {
        if (!v) continue;
        const s = tokenScore(token, v) * (f.weight ?? 1);
        if (s > best) best = s;
      }
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function smartFilter<T>(items: T[], query: string, fieldsOf: (item: T) => SearchField[]): T[] {
  const q = query.trim();
  if (!q) return items;
  return items
    .map((item) => ({ item, score: scoreItem(q, fieldsOf(item)) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

/* ---------- date awareness ---------- */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Turns ISO dates into searchable words: "2025-11-03" → "2025 nov november 3 november 2025 nov 2025". */
export function dateWords(...isoDates: (string | undefined)[]): string[] {
  const out: string[] = [];
  for (const d of isoDates) {
    if (!d) continue;
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const y = m[1];
    const mi = parseInt(m[2], 10) - 1;
    const day = String(parseInt(m[3], 10));
    out.push(y, MONTHS[mi], MONTH_FULL[mi], `${MONTHS[mi]} ${y}`, `${MONTH_FULL[mi]} ${y}`, `${day} ${MONTHS[mi]}`, `${MONTHS[mi]} ${day}`, `${m[3]}/${m[2]}`, `${m[2]}/${m[3]}`, d);
  }
  return out;
}

/** Words for every month in a range, so "dec" finds a trip spanning Nov 28 → Dec 4. */
export function dateRangeWords(start?: string, end?: string): string[] {
  if (!start) return [];
  if (!end || end < start) return dateWords(start);
  const words = new Set(dateWords(start, end));
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const cur = new Date(s.getFullYear(), s.getMonth(), 1);
  while (cur <= e) {
    words.add(MONTHS[cur.getMonth()]);
    words.add(MONTH_FULL[cur.getMonth()]);
    words.add(`${MONTHS[cur.getMonth()]} ${cur.getFullYear()}`);
    words.add(String(cur.getFullYear()));
    cur.setMonth(cur.getMonth() + 1);
  }
  return [...words];
}

/** Highlight helper: splits text into [match, plain] segments for the first matching token. */
export function highlightParts(text: string, query: string): { text: string; hit: boolean }[] {
  const tokens = normalize(query).split(" ").filter((t) => t.length >= 2);
  if (!tokens.length || !text) return [{ text, hit: false }];
  const lower = normalize(text);
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i >= 0 && lower.length === text.length) {
      return [
        { text: text.slice(0, i), hit: false },
        { text: text.slice(i, i + t.length), hit: true },
        { text: text.slice(i + t.length), hit: false },
      ].filter((p) => p.text);
    }
  }
  return [{ text, hit: false }];
}
