import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspaces, current, setCurrent, refresh } = useWorkspace();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const create = async () => {
    if (!user || !name.trim()) return;
    const { data, error } = await supabase.rpc("create_workspace", { p_name: name.trim() });
    if (error || !data) return toast.error(error?.message ?? "Failed");
    setName("");
    await refresh();
    setCurrent(data as string);
    toast.success("Workspace created");
  };

  if (collapsed) {
    return (
      <Button variant="ghost" size="icon" className="w-full" title={current?.name}>
        <Building2 className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal" size="sm">
          <span className="flex items-center gap-2 truncate"><Building2 className="h-3.5 w-3.5 shrink-0" />{current?.name ?? "Workspace"}</span>
          <ChevronsUpDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Workspaces</div>
        <ul className="space-y-0.5">
          {workspaces.map((w) => (
            <li key={w.id}>
              <button
                onClick={() => { setCurrent(w.id); setOpen(false); }}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="truncate">{w.name}</span>
                {current?.id === w.id && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 border-t border-border pt-2">
          <div className="flex gap-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New workspace" className="h-8 text-sm" />
            <Button size="sm" onClick={create} disabled={!name.trim()}>Add</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
