import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

type Ctx = { unreadCount: number; refresh: () => Promise<void> };
const C = createContext<Ctx>({ unreadCount: 0, refresh: async () => {} });

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadCount, setUnread] = useState(0);

  const refresh = async () => {
    if (!user) { setUnread(0); return; }
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("archived_at", null);
    setUnread(count ?? 0);
  };

  useEffect(() => {
    if (!user) { setUnread(0); return; }
    refresh();
    const ch = supabase
      .channel("notifs-global:" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n: any = payload.new;
          toast(n.title, { description: n.body ?? undefined });
          setUnread((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return <C.Provider value={{ unreadCount, refresh }}>{children}</C.Provider>;
}

export function useNotifications() {
  return useContext(C);
}
