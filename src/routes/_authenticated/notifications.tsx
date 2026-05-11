import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Check, CheckCheck, Trash2, ExternalLink, Archive, ArchiveRestore, Inbox } from "lucide-react";
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
  archived_at: string | null;
  created_at: string;
};

type View = "inbox" | "unread" | "read" | "archived";

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("inbox");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: items = [] } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,body,link,read_at,archived_at,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(500);
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

  const types = useMemo(() => Array.from(new Set(items.map((i) => i.type))), [items]);

  const filtered = useMemo(() => {
    return items.filter((n) => {
      if (view === "archived") {
        if (!n.archived_at) return false;
      } else {
        if (n.archived_at) return false;
        if (view === "unread" && n.read_at) return false;
        if (view === "read" && !n.read_at) return false;
      }
      if (typeFilter !== "all" && n.type !== typeFilter) return false;
      return true;
    });
  }, [items, view, typeFilter]);

  const ids = filtered.map((f) => f.id);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(ids));
  };
  const toggleOne = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications", user?.id] });

  const bulkRead = async (read: boolean) => {
    if (!selected.size) return;
    await supabase
      .from("notifications")
      .update({ read_at: read ? new Date().toISOString() : null })
      .in("id", [...selected]);
    refresh();
    setSelected(new Set());
    toast.success(read ? "Marked as read" : "Marked as unread");
  };

  const bulkArchive = async (archive: boolean) => {
    if (!selected.size) return;
    await supabase
      .from("notifications")
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .in("id", [...selected]);
    refresh();
    setSelected(new Set());
    toast.success(archive ? "Archived" : "Restored");
  };

  const bulkDelete = async () => {
    if (!selected.size) return;
    await supabase.from("notifications").delete().in("id", [...selected]);
    refresh();
    setSelected(new Set());
    toast.success("Deleted");
  };

  const markAll = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("archived_at", null);
    refresh();
    toast.success("All notifications marked as read");
  };

  const unread = items.filter((i) => !i.read_at && !i.archived_at).length;

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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {(["inbox", "unread", "read", "archived"] as View[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? "default" : "ghost"}
            onClick={() => { setView(v); setSelected(new Set()); }}
            className="capitalize"
          >
            {v === "archived" ? <Archive className="mr-1.5 h-3.5 w-3.5" /> : <Inbox className="mr-1.5 h-3.5 w-3.5" />}
            {v}
          </Button>
        ))}
        <div className="ml-auto w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => (
                <SelectItem key={t} value={t} className="capitalize">{t.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk action bar */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Select all"}
          </span>
          {selected.size > 0 && (
            <div className="ml-auto flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => bulkRead(true)}><Check className="mr-1.5 h-3.5 w-3.5" />Read</Button>
              <Button size="sm" variant="outline" onClick={() => bulkRead(false)}>Unread</Button>
              {view === "archived" ? (
                <Button size="sm" variant="outline" onClick={() => bulkArchive(false)}><ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />Restore</Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => bulkArchive(true)}><Archive className="mr-1.5 h-3.5 w-3.5" />Archive</Button>
              )}
              <Button size="sm" variant="destructive" onClick={bulkDelete}><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 py-16 text-center">
          <Bell className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nothing here.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => (
            <Card
              key={n.id}
              className={`flex flex-wrap items-start gap-3 p-4 ${!n.read_at && !n.archived_at ? "border-primary/30 bg-accent/20" : ""}`}
            >
              <Checkbox
                checked={selected.has(n.id)}
                onCheckedChange={() => toggleOne(n.id)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {!n.read_at && !n.archived_at && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
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
                  <Button asChild size="sm" variant="outline">
                    <Link
                      to={n.link}
                      onClick={async () => {
                        if (!n.read_at) {
                          await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
                          refresh();
                        }
                      }}
                    >
                      Open <ExternalLink className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
