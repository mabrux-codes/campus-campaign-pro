import { Check, ChevronsUpDown, Building2, ArrowRightLeft } from "lucide-react";
import { useState } from "react";
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

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspaces, current, setCurrent, refresh } = useWorkspace();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [target, setTarget] = useState<string>("");
  const [moving, setMoving] = useState(false);

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

  const moveData = async () => {
    if (!current?.id || !target) return;
    setMoving(true);
    const tables = ["campaigns", "influencer_profiles", "deliverables_catalog", "security_findings", "campaign_influencers"] as const;
    for (const t of tables) {
      const { error } = await supabase.from(t).update({ workspace_id: target }).eq("workspace_id", current.id);
      if (error) {
        setMoving(false);
        return toast.error(`${t}: ${error.message}`);
      }
    }
    setMoving(false);
    setMoveOpen(false);
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
          {canMove && ownedTargets.length > 0 && (
            <div className="mt-2 border-t border-border pt-2">
              <button
                onClick={() => { setOpen(false); setMoveOpen(true); }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" /> Move data to another workspace
              </button>
            </div>
          )}
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex gap-1">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New workspace" className="h-8 text-sm" />
              <Button size="sm" onClick={create} disabled={!name.trim()}>Add</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move workspace data</DialogTitle>
            <DialogDescription>
              Transfer all campaigns, influencers, deliverables and findings from{" "}
              <span className="font-medium text-foreground">{current?.name}</span> into another workspace you own. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Destination workspace</label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue placeholder="Select a workspace you own" /></SelectTrigger>
              <SelectContent>
                {ownedTargets.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveOpen(false)} disabled={moving}>Cancel</Button>
            <Button onClick={moveData} disabled={!target || moving}>{moving ? "Moving…" : "Move data"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
