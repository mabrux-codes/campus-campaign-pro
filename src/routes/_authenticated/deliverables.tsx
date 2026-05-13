import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, ListChecks, Save, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/deliverables")({
  component: DeliverablesPage,
});

type Item = { id: string; label: string; created_at: string };

function DeliverablesPage() {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["deliverables-catalog", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliverables_catalog")
        .select("id,label,created_at")
        .eq("workspace_id", current!.id)
        .order("label");
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["deliverables-catalog", current?.id] });

  const create = async () => {
    const label = newLabel.trim();
    if (!label) return toast.error("Enter a deliverable name");
    if (!current?.id) return toast.error("No workspace selected");
    const { error } = await supabase.from("deliverables_catalog").insert({ workspace_id: current.id, label });
    if (error) return toast.error(error.message);
    setNewLabel("");
    refresh();
    toast.success("Deliverable added");
  };

  const startEdit = (it: Item) => { setEditingId(it.id); setEditingLabel(it.label); };
  const cancelEdit = () => { setEditingId(null); setEditingLabel(""); };
  const saveEdit = async () => {
    if (!editingId) return;
    const label = editingLabel.trim();
    if (!label) return toast.error("Label required");
    const { error } = await supabase.from("deliverables_catalog").update({ label }).eq("id", editingId);
    if (error) return toast.error(error.message);
    cancelEdit();
    refresh();
    toast.success("Updated");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this deliverable?")) return;
    const { error } = await supabase.from("deliverables_catalog").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
    toast.success("Deleted");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Deliverables</h1>
        <p className="text-sm text-muted-foreground">Reusable deliverable types for {current?.name ?? "your workspace"}.</p>
      </div>

      <Card>
        <CardContent className="flex gap-2 p-4">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">New deliverable</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Instagram Reel, Blog Post, TikTok Video"
              onKeyDown={(e) => e.key === "Enter" && create()}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={create}><Plus className="mr-2 h-4 w-4" />Add</Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : items.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-12 text-center">
          <ListChecks className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No deliverables yet — add your first one above.</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {items.map((it) => (
                <li key={it.id} className="flex items-center gap-2 p-3">
                  {editingId === it.id ? (
                    <>
                      <Input
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        autoFocus
                        className="flex-1"
                      />
                      <Button size="sm" onClick={saveEdit}><Save className="mr-1.5 h-3.5 w-3.5" />Save</Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm">{it.label}</span>
                      <Button size="icon" variant="ghost" onClick={() => startEdit(it)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(it.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
