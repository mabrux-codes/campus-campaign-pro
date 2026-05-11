import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const CURRENCIES = ["USD", "GBP", "KES", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

const SYMBOLS: Record<Currency, string> = {
  USD: "$",
  GBP: "£",
  KES: "KSh ",
  AUD: "A$",
  CAD: "C$",
};

type Ctx = { currency: Currency; setCurrency: (c: Currency) => Promise<void>; symbol: string };
const C = createContext<Ctx | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [currency, setCurrencyState] = useState<Currency>("USD");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("currency")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        const c = (data?.currency as Currency) ?? "USD";
        if (CURRENCIES.includes(c)) setCurrencyState(c);
      });
  }, [user?.id]);

  const setCurrency = async (c: Currency) => {
    setCurrencyState(c);
    if (user) await supabase.from("profiles").update({ currency: c }).eq("id", user.id);
  };

  return <C.Provider value={{ currency, setCurrency, symbol: SYMBOLS[currency] }}>{children}</C.Provider>;
}

export function useCurrency() {
  const c = useContext(C);
  if (!c) throw new Error("useCurrency must be inside CurrencyProvider");
  return c;
}

export function formatMoney(amount: number | null | undefined, currency: Currency = "USD") {
  if (amount === null || amount === undefined) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${SYMBOLS[currency]}${Number(amount).toLocaleString()}`;
  }
}
