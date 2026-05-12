import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Multi-select deliverables backed by `deliverables_catalog`. Stores as comma list in parent string. */
export function DeliverablesPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { current } = useWorkspace();
  const [catalog, setCatalog] = useState<{ id: string; label: string }[]>([]);
  const [draft, setDraft] = useState("");

  const selected = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

  const load = async () => {
    if (!current?.id) return;
    const { data } = await supabase
      .from("deliverables_catalog")
      .select("id,label")
      .eq("workspace_id", current.id)
      .order("label");
    setCatalog(data ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  const toggle = (label: string) => {
    const next = selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label];
    onChange(next.join(", "));
  };

  const create = async () => {
    const label = draft.trim();
    if (!label || !current?.id) return;
    const { error } = await supabase.from("deliverables_catalog").insert({ workspace_id: current.id, label });
    if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    setDraft("");
    await load();
    if (!selected.includes(label)) onChange([...selected, label].join(", "));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 rounded-md border border-input bg-background p-2 min-h-9">
        {selected.length === 0 && <span className="text-xs text-muted-foreground self-center">No deliverables selected</span>}
        {selected.map((s) => (
          <Badge key={s} variant="secondary" className="gap-1">
            {s}
            <button type="button" onClick={() => toggle(s)} className="hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      {catalog.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {catalog.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => toggle(c.label)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                selected.includes(c.label) ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder="Add a new deliverable (e.g. Instagram Reel)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }}
        />
        <Button type="button" variant="outline" size="sm" onClick={create} disabled={!draft.trim()}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}
