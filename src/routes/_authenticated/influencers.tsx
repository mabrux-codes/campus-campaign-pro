import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, Plus, Users, Trash2, Sparkles, Pencil } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SOCIAL_PLATFORMS, handlePlaceholder } from "@/lib/social-platforms";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/influencers")({
  component: InfluencersPage,
});

type Profile = {
  id: string;
  name: string;
  platform: string | null;
  handle: string | null;
  followers: number | null;
  avatar_url: string | null;
};

function InfluencersPage() {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["influencer-profiles", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("influencer_profiles")
        .select("id,name,platform,handle,followers,avatar_url")
        .eq("workspace_id", current!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  // Pull all per-campaign rows linked to these profiles to compute avg engagement + campaign count.
  const profileIds = profiles.map((p) => p.id);
  const { data: campaignRows = [] } = useQuery({
    queryKey: ["influencer-campaign-rows", profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("influencers")
        .select("profile_id,engagement_rate,campaign_id")
        .in("profile_id", profileIds);
      return data ?? [];
    },
  });

  const aggByProfile = useMemo(() => {
    const m: Record<string, { engs: number[]; campaigns: Set<string> }> = {};
    campaignRows.forEach((r: any) => {
      if (!r.profile_id) return;
      const e = m[r.profile_id] ||= { engs: [], campaigns: new Set() };
      if (r.engagement_rate != null) e.engs.push(Number(r.engagement_rate));
      if (r.campaign_id) e.campaigns.add(r.campaign_id);
    });
    return m;
  }, [campaignRows]);

  const filtered = useMemo(
    () => profiles.filter((p) => !q || `${p.name} ${p.handle ?? ""} ${p.platform ?? ""}`.toLowerCase().includes(q.toLowerCase())),
    [profiles, q],
  );

  const totals = {
    total: profiles.length,
    followers: profiles.reduce((a, p) => a + (p.followers ?? 0), 0),
    avgEng: (() => {
      const allEngs = Object.values(aggByProfile).flatMap((a) => a.engs);
      return allEngs.length ? allEngs.reduce((s, n) => s + n, 0) / allEngs.length : 0;
    })(),
    activeCount: Object.values(aggByProfile).filter((a) => a.campaigns.size > 0).length,
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this influencer from your library? Existing campaigns are unaffected.")) return;
    const { error } = await supabase.from("influencer_profiles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["influencer-profiles", current?.id] });
    toast.success("Removed");
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Influencers</h1>
          <p className="text-sm text-muted-foreground">Your reusable creator library across campaigns.</p>
        </div>
        <NewInfluencerDialog onCreated={() => qc.invalidateQueries({ queryKey: ["influencer-profiles", current?.id] })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Influencers" value={totals.total.toString()} />
        <Stat label="Total followers" value={totals.followers.toLocaleString()} />
        <Stat label="Avg engagement" value={`${totals.avgEng.toFixed(1)}%`} />
        <Stat label="Active in campaigns" value={totals.activeCount.toString()} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, handle, platform" className="pl-9" />
      </div>

      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{profiles.length === 0 ? "No influencers yet — add your first one." : "No matches."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const agg = aggByProfile[p.id];
            const avgEng = agg && agg.engs.length ? agg.engs.reduce((s, n) => s + n, 0) / agg.engs.length : null;
            return (
              <Card key={p.id} className="group transition hover:shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent text-base font-semibold uppercase">
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.name} className="h-full w-full rounded-full object-cover" /> : p.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.handle || "—"}</p>
                    </div>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <EditInfluencerDialog
                        profile={p}
                        onSaved={() => qc.invalidateQueries({ queryKey: ["influencer-profiles", current?.id] })}
                      />
                      <Button size="icon" variant="ghost" onClick={() => remove(p.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.platform && <Badge variant="outline">{p.platform}</Badge>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <Mini label="Followers" value={p.followers?.toLocaleString() ?? "—"} />
                    <Mini label="Avg Eng." value={avgEng != null ? `${avgEng.toFixed(1)}%` : "—"} />
                    <Mini label="Campaigns" value={(agg?.campaigns.size ?? 0).toString()} />
                  </div>
                  {agg && agg.campaigns.size > 0 && (
                    <Link
                      to="/campaigns"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <Sparkles className="h-3 w-3" /> View activity
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewInfluencerDialog({ onCreated }: { onCreated: () => void }) {
  const { current } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", platform: "", handle: "", followers: "" });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!form.platform) return toast.error("Pick a platform");
    if (!current?.id) return toast.error("No workspace selected");
    setBusy(true);
    const { error } = await supabase.from("influencer_profiles").insert({
      workspace_id: current.id,
      name: form.name.trim(),
      platform: form.platform,
      handle: form.handle || null,
      followers: form.followers ? Number(form.followers) : null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Influencer added");
    setForm({ name: "", platform: "", handle: "", followers: "" });
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Add influencer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New influencer</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
              <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {form.platform && (
            <div className="space-y-2">
              <Label>Handle / URL</Label>
              <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder={handlePlaceholder(form.platform)} />
            </div>
          )}
          <div className="space-y-2">
            <Label>Followers</Label>
            <Input type="number" value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditInfluencerDialog({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: profile.name,
    platform: profile.platform ?? "",
    handle: profile.handle ?? "",
    followers: profile.followers?.toString() ?? "",
    avatar_url: profile.avatar_url ?? "",
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    const { error } = await supabase
      .from("influencer_profiles")
      .update({
        name: form.name.trim(),
        platform: form.platform || null,
        handle: form.handle || null,
        followers: form.followers ? Number(form.followers) : null,
        avatar_url: form.avatar_url || null,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" onClick={(e) => e.stopPropagation()}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit influencer</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent text-lg font-semibold uppercase">
              {form.avatar_url ? <img src={form.avatar_url} alt={form.name} className="h-full w-full rounded-full object-cover" /> : (form.name || "?").slice(0, 2)}
            </div>
            <div className="flex-1 space-y-2">
              <Label>Avatar URL</Label>
              <Input value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Platform</Label>
            <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
              <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Handle / URL</Label>
            <Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder={form.platform ? handlePlaceholder(form.platform) : ""} />
          </div>
          <div className="space-y-2">
            <Label>Followers</Label>
            <Input type="number" value={form.followers} onChange={(e) => setForm({ ...form, followers: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}
