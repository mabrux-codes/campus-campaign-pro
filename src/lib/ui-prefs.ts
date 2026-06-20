import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

/**
 * Per-user UI preferences persisted to profiles.ui_prefs (jsonb).
 * Syncs across devices for the signed-in user. Falls back to localStorage
 * so the first paint is correct before the network round-trip.
 */
export function useUiPref<T>(key: string, defaultValue: T): [T, (next: T) => void] {
  const { user } = useAuth();
  const storageKey = `ui_pref:${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(storageKey);
      return raw != null ? (JSON.parse(raw) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  const loaded = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("ui_prefs")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const prefs = (data?.ui_prefs ?? {}) as Record<string, unknown>;
        if (key in prefs) setValue(prefs[key] as T);
        loaded.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {}
      if (!user) return;
      supabase
        .from("profiles")
        .select("ui_prefs")
        .eq("id", user.id)
        .maybeSingle()
        .then(({ data }) => {
          const prefs = { ...((data?.ui_prefs ?? {}) as Record<string, unknown>), [key]: next as unknown };
          supabase.from("profiles").update({ ui_prefs: prefs as never }).eq("id", user.id);
        });
    },
    [user?.id, key, storageKey],
  );

  return [value, update];
}
