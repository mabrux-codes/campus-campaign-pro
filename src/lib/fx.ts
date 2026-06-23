// Simple FX rate fetcher with localStorage caching (1h) and stale fallback
export type Rates = Record<string, number>; // base USD

const KEY = "fx_rates_v1";
const TTL = 60 * 60 * 1000;

export type RatesResult = { rates: Rates; updated: number; stale: boolean };

function readCache(): { rates: Rates; updated: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && p.rates && typeof p.updated === "number") return p;
  } catch {}
  return null;
}

export async function getRates(): Promise<RatesResult | null> {
  const cached = readCache();
  if (cached && Date.now() - cached.updated < TTL) {
    return { ...cached, stale: false };
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("bad status");
    const j = await res.json();
    if (j.result !== "success") throw new Error("bad payload");
    const fresh = { rates: j.rates as Rates, updated: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch {}
    return { ...fresh, stale: false };
  } catch {
    // Refresh failed — fall back to last known rate, marked stale
    if (cached) return { ...cached, stale: true };
    return null;
  }
}

export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const f = from === "USD" ? 1 : rates[from];
  const t = to === "USD" ? 1 : rates[to];
  if (!f || !t) return null;
  return (amount / f) * t;
}
