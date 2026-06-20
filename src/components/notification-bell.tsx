import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDistanceToNow } from "date-fns";

type Notif = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

const PAGE_SIZE = 5;

export function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadFirst = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id,title,body,link,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE + 1);
    const rows = data ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    setItems(rows.slice(0, PAGE_SIZE));
    setVisible(PAGE_SIZE);
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null);
    setUnreadCount(count ?? 0);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    loadFirst();
    const ch = supabase
      .channel("notifications:" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        loadFirst,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, loadFirst]);

  const loadMore = async () => {
    if (!user || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    const last = items[items.length - 1];
    const { data } = await supabase
      .from("notifications")
      .select("id,title,body,link,read_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .lt("created_at", last.created_at)
      .limit(PAGE_SIZE + 1);
    const rows = data ?? [];
    setHasMore(rows.length > PAGE_SIZE);
    setItems((prev) => [...prev, ...rows.slice(0, PAGE_SIZE)]);
    setVisible((v) => v + PAGE_SIZE);
    setLoadingMore(false);
  };

  const markAll = async () => {
    if (!user) return;
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    loadFirst();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute right-1 top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifications
          {unreadCount > 0 && (
            <button onClick={markAll} className="text-xs font-normal text-muted-foreground hover:underline">
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">You're all caught up.</p>
          ) : (
            items.map((n) => (
              <DropdownMenuItem key={n.id} asChild>
                <Link to={n.link ?? "/dashboard"} className={`flex flex-col items-start gap-0.5 ${!n.read_at ? "bg-accent/30" : ""}`}>
                  <span className="text-sm font-medium">{n.title}</span>
                  {n.body && <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>}
                  <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}</span>
                </Link>
              </DropdownMenuItem>
            ))
          )}
          {hasMore && items.length > 0 && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : `Load older (${visible} shown)`}
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/notifications" className="justify-center text-xs font-medium text-primary">View all notifications →</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
