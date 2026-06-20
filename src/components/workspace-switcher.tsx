import { Check, ChevronsUpDown, Building2, ArrowRightLeft, History, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const MOVE_TABLES = [
  "campaigns",
  "influencer_profiles",
  "deliverables_catalog",
  "security_findings",
  "campaign_influencers",
] as const;

type Counts = Record<(typeof MOVE_TABLES)[number], number>;

type ActivityRow = {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  actor_id: string | null;
};

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspaces, current, setCurrent, refresh } = useWorkspace();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState<string>("");
  const [moving, setMoving] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [counting, setCounting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  const create = async () => {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase.rpc("create_workspace", { p_name: name.trim() });
    if (error || !data) return toast.error(error?.message ?? "Failed");
    setName("");
    await refresh();
    setCurrent(data as string);
    toast.success("Workspace created");
  };

  const ownedTargets = workspaces.filter(
    (w) => w.id !== current?.id && w.role === "owner",
  );
  const canMove = current?.role === "owner";

  const runDryRun = async () => {
    if (!current?.id) return;
    setCounting(true);
    setCounts(null);
    setConfirmed(false);
    const out = {} as Counts;
    for (const t of MOVE_TABLES) {
      const { count } = await supabase
        .from(t)
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", current.id);
      out[t] = count ?? 0;
    }
    setCounts(out);
    setCounting(false);
  };

  useEffect(() => {
    if (moveOpen) runDryRun();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveOpen, current?.id]);

  const loadActivity = async () => {
    if (!current?.id) return;
    const { data } = await supabase
      .from("workspace_activity")
      .select("id,action,details,created_at,actor_id")
      .eq("workspace_id", current.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setActivity((data ?? []) as ActivityRow[]);
  };

  useEffect(() => {
    if (activityOpen) loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityOpen, current?.id]);

  const moveData = async () => {
    if (!current?.id || !target || !counts || !user) return;
    setMoving(true);
    const moved = {} as Counts;
    for (const t of MOVE_TABLES) {
      const { error, count } = await supabase
        .from(t)
        .update({ workspace_id: target }, { count: "exact" })
        .eq("workspace_id", current.id)
        .select("id", { count: "exact", head: true });
      if (error) {
        setMoving(false);
        return toast.error(`${t}: ${error.message}`);
      }
      moved[t] = count ?? 0;
    }
    const targetName = workspaces.find((w) => w.id === target)?.name ?? target;
    const sourceName = current.name;
    // Log activity in BOTH workspaces so it's visible from either side
    await supabase.from("workspace_activity").insert([
      {
        workspace_id: current.id,
        actor_id: user.id,
        action: "workspace.data_moved_out",
        details: { target_workspace_id: target, target_workspace_name: targetName, counts: moved },
      },
      {
        workspace_id: target,
        actor_id: user.id,
        action: "workspace.data_moved_in",
        details: { source_workspace_id: current.id, source_workspace_name: sourceName, counts: moved },
      },
    ]);
    setMoving(false);
    setMoveOpen(false);
    setCounts(null);
    setConfirmed(false);
    setCurrent(target);
    toast.success("Workspace data moved");
  };

  if (collapsed) {
    return (
      <Button variant="ghost" size="icon" className="w-full" title={current?.name}>
        <Building2 className="h-4 w-4" />
      </Button>
    );
  }

  const totalRows = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between font-normal" size="sm">
            <span className="flex items-center gap-2 truncate"><Building2 className="h-3.5 w-3.5 shrink-0" />{current?.name ?? "Workspace"}</span>
            <ChevronsUpDown className="h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-2" align="start">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Switch workspace</div>
          <ul className="space-y-0.5">
            {workspaces.map((w) => {
              const isAdmin = w.role === "owner" || w.role === "admin";
              return (
                <li key={w.id}>
                  <button
                    onClick={() => { setCurrent(w.id); setOpen(false); }}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <span className="truncate">{w.name}</span>
                    <span className="flex items-center gap-1">
                      {isAdmin && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {w.role}
                        </span>
                      )}
                      {current?.id === w.id && <Check className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
            {canMove && ownedTargets.length > 0 && (
              <button
                onClick={() => { setOpen(false); setMoveOpen(true); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Move data to another workspace
              </button>
            )}
            <button
              onClick={() => { setOpen(false); setActivityOpen(true); }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" /> Activity log
            </button>
          </div>
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex gap-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New workspace" className="h-8 text-sm" />
              <Button size="sm" onClick={create} disabled={!name.trim()}>Add</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={moveOpen} onOpenChange={(o) => { setMoveOpen(o); if (!o) { setConfirmed(false); setTarget(""); setCounts(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move workspace data</DialogTitle>
            <DialogDescription>
              Transfer everything from <span className="font-medium text-foreground">{current?.name}</span> into another workspace you own. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Destination workspace</label>
              <Select value={target} onValueChange={(v) => { setTarget(v); setConfirmed(false); }}>
                <SelectTrigger><SelectValue placeholder="Select a workspace you own" /></SelectTrigger>
                <SelectContent>
                  {ownedTargets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dry-run summary</span>
                {counting && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              {counts ? (
                <>
                  <ul className="space-y-1 text-sm">
                    {MOVE_TABLES.map((t) => (
                      <li key={t} className="flex items-center justify-between">
                        <span className="capitalize text-muted-foreground">{t.replace(/_/g, " ")}</span>
                        <span className="font-mono tabular-nums">{counts[t]}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-medium">
                    <span>Total rows</span>
                    <span className="font-mono tabular-nums">{totalRows}</span>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">{counting ? "Counting rows…" : "Pending."}</p>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!target || !counts}
              />
              <span className="text-muted-foreground">
                I understand this will reassign <span className="font-medium text-foreground">{totalRows} rows</span> to{" "}
                <span className="font-medium text-foreground">{workspaces.find((w) => w.id === target)?.name ?? "the selected workspace"}</span>. This action is recorded in the activity log.
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(false)} disabled={moving}>Cancel</Button>
            <Button onClick={moveData} disabled={!target || !counts || !confirmed || moving}>
              {moving ? "Moving…" : `Move ${totalRows} rows`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={activityOpen} onOpenChange={setActivityOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Workspace activity</DialogTitle>
            <DialogDescription>Recent admin events in {current?.name}.</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              activity.map((a) => {
                const d = (a.details ?? {}) as Record<string, unknown>;
                const counts = (d.counts as Counts | undefined) ?? null;
                const total = counts ? Object.values(counts).reduce((x, y) => x + y, 0) : null;
                const label =
                  a.action === "workspace.data_moved_out"
                    ? `Data moved → ${String(d.target_workspace_name ?? "another workspace")}`
                    : a.action === "workspace.data_moved_in"
                    ? `Data received ← ${String(d.source_workspace_name ?? "another workspace")}`
                    : a.action;
                return (
                  <div key={a.id} className="rounded-md border border-border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    {total != null && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{total} rows moved</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
