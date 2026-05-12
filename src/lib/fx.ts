// Simple FX rate fetcher with localStorage caching (1h)
export type Rates = Record<string, number>; // base USD

const KEY = "fx_rates_v1";
const TTL = 60 * 60 * 1000;

export async function getRates(): Promise<{ rates: Rates; updated: number } | null> {
  try {
    const cached = localStorage.getItem(KEY);
    if (cached) {
      const p = JSON.parse(cached);
      if (Date.now() - p.updated < TTL) return p;
    }
  } catch {}
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) return null;
    const j = await res.json();
    if (j.result !== "success") return null;
    const out = { rates: j.rates as Rates, updated: Date.now() };
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch {}
    return out;
  } catch {
    return null;
  }
}

export function convert(amount: number, from: string, to: string, rates: Rates): number | null {
  const f = from === "USD" ? 1 : rates[from];
  const t = to === "USD" ? 1 : rates[to];
  if (!f || !t) return null;
  return (amount / f) * t;
}
