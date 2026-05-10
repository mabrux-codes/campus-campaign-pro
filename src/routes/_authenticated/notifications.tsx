import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Bell, Check, CheckCheck, Trash2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,read_at,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("notifications-page:" + user.id)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => qc.invalidateQueries({ queryKey: ["notifications", user.id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id, qc, user]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const markAll = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications", user.id] });
    toast.success("All notifications marked as read");
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
  };

  const unread = items.filter((i) => !i.read_at).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{unread} unread</p>
          <h1 className="font-display text-4xl">Notifications</h1>
        </div>
        {unread > 0 && (
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">You're all caught up.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n.id}
              className={`flex flex-wrap items-start justify-between gap-3 p-4 ${!n.read_at ? "border-primary/30 bg-accent/20" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!n.read_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  <p className="font-medium">{n.title}</p>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {n.type.replaceAll("_", " ")}
                  </span>
                </div>
                {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {n.link && (
                  <Button asChild size="sm" variant="outline" onClick={() => !n.read_at && markRead(n.id)}>
                    <Link to={n.link}>
                      Open <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
                {!n.read_at && (
                  <Button size="icon" variant="ghost" onClick={() => markRead(n.id)} title="Mark as read">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => remove(n.id)} title="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
