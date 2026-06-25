import { useEffect, useState, useCallback } from "react";
import { Bell, Loader2, AlertCircle } from "lucide-react";
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
  const [loadingFirst, setLoadingFirst] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadFirst = useCallback(async () => {
    if (!user) return;
    setLoadingFirst(true);
    setError(null);
    try {
      const { data, error: e1 } = await supabase
        .from("notifications")
        .select("id,title,body,link,read_at,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE + 1);
      if (e1) throw e1;
      const rows = data ?? [];
      setHasMore(rows.length > PAGE_SIZE);
      setItems(rows.slice(0, PAGE_SIZE));
      setVisible(PAGE_SIZE);
      const { count, error: e2 } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);
      if (e2) throw e2;
      setUnreadCount(count ?? 0);
    } catch (err: any) {
      setError(err?.message ?? "Couldn't load notifications");
    } finally {
      setLoadingFirst(false);
    }
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

  const [retryAttempt, setRetryAttempt] = useState(0);

  const loadMore = useCallback(async () => {
    if (!user || loadingMore || items.length === 0) return;
    setLoadingMore(true);
    setError(null);
    const last = items[items.length - 1];
    const MAX_ATTEMPTS = 4;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      setRetryAttempt(attempt > 1 ? attempt : 0);
      try {
        const { data, error: e } = await supabase
          .from("notifications")
          .select("id,title,body,link,read_at,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .lt("created_at", last.created_at)
          .limit(PAGE_SIZE + 1);
        if (e) throw e;
        const rows = data ?? [];
        setHasMore(rows.length > PAGE_SIZE);
        setItems((prev) => [...prev, ...rows.slice(0, PAGE_SIZE)]);
        setVisible((v) => v + PAGE_SIZE);
        setRetryAttempt(0);
        setLoadingMore(false);
        return;
      } catch (err: any) {
        lastErr = err;
        if (attempt < MAX_ATTEMPTS) {
          // Exponential backoff with jitter: 400ms, 800ms, 1600ms
          const delay = 400 * Math.pow(2, attempt - 1) + Math.random() * 150;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    setError(lastErr?.message ?? "Couldn't load older notifications");
    setRetryAttempt(0);
    setLoadingMore(false);
  }, [user?.id, loadingMore, items]);

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
          {loadingFirst && items.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : error && items.length === 0 ? (
            <div className="space-y-2 px-3 py-4 text-center">
              <p className="flex items-center justify-center gap-1 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> {error}
              </p>
              <button onClick={loadFirst} className="text-xs font-medium text-primary hover:underline">Retry</button>
            </div>
          ) : items.length === 0 ? (
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
          {error && items.length > 0 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-destructive">
              <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {error}</span>
              <button onClick={loadMore} className="font-medium underline">Retry</button>
            </div>
          )}
          {hasMore && items.length > 0 && !error && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 px-3 py-2 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {loadingMore ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {retryAttempt > 1 ? `Retrying… (attempt ${retryAttempt}/4)` : "Loading older…"}
                </>
              ) : (
                `Load older (${visible} shown)`
              )}
            </button>
          )}
          {!hasMore && items.length > PAGE_SIZE && (
            <p className="px-3 py-2 text-center text-[10px] text-muted-foreground">No more notifications</p>
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
