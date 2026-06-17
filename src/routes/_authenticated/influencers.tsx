import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Search, Plus, Users, Trash2, Sparkles, Pencil, Upload, Activity as ActivityIcon, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SOCIAL_PLATFORMS, handlePlaceholder } from "@/lib/social-platforms";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/influencers")({
  component: InfluencersPage,
});

type PlatformEntry = { platform: string; handle: string; followers: number | null };
type Profile = {
  id: string;
  name: string;
  platform: string | null;
  handle: string | null;
  followers: number | null;
  avatar_url: string | null;
  platforms: PlatformEntry[] | null;
};

function normalizePlatforms(p: Profile): PlatformEntry[] {
  const arr = Array.isArray(p.platforms) ? p.platforms : [];
  if (arr.length > 0) return arr;
  if (p.platform) return [{ platform: p.platform, handle: p.handle ?? "", followers: p.followers ?? null }];
  return [];
}

function totalFollowers(p: Profile): number {
  const list = normalizePlatforms(p);
  if (list.length > 0) return list.reduce((s, e) => s + (e.followers ?? 0), 0);
  return p.followers ?? 0;
}

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
        .select("id,name,platform,handle,followers,avatar_url,platforms")
        .eq("workspace_id", current!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });

  const profileIds = profiles.map((p) => p.id);
  const { data: campaignRows = [] } = useQuery({
    queryKey: ["influencer-campaign-rows", profileIds.join(",")],
    enabled: profileIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("influencers")
        .select("profile_id,engagement_rate,campaign_id,campaigns:campaign_id(id,status)")
        .in("profile_id", profileIds);
      return data ?? [];
    },
  });

  const activeProfileIds = useMemo(() => {
    const s = new Set<string>();
    campaignRows.forEach((r: any) => {
      if (r.profile_id && r.campaigns?.status === "active") s.add(r.profile_id);
    });
    return s;
  }, [campaignRows]);

  // Auto re-list / unlist as campaigns flip status (active <-> completed)
  useEffect(() => {
    if (!current?.id) return;
    const ch = supabase
      .channel("campaign-status:" + current.id)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "campaigns", filter: `workspace_id=eq.${current.id}` }, (payload) => {
        const oldStatus = (payload.old as any)?.status;
        const newStatus = (payload.new as any)?.status;
        if (oldStatus !== newStatus) {
          qc.invalidateQueries({ queryKey: ["influencer-campaign-rows"] });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_influencers", filter: `workspace_id=eq.${current.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["influencer-campaign-rows"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [current?.id, qc]);

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

  const [tab, setTab] = useState<"available" | "active">("available");
  const [view, setView] = useState<"grid" | "list">("grid");

  const visibleProfiles = useMemo(
    () => profiles.filter((p) => tab === "active" ? activeProfileIds.has(p.id) : !activeProfileIds.has(p.id)),
    [profiles, activeProfileIds, tab],
  );

  const filtered = useMemo(
    () => visibleProfiles.filter((p) => {
      if (!q) return true;
      const platformsText = normalizePlatforms(p).map((e) => `${e.platform} ${e.handle}`).join(" ");
      return `${p.name} ${platformsText}`.toLowerCase().includes(q.toLowerCase());
    }),
    [visibleProfiles, q],
  );

  // IG stories engagement per influencer from reports
  const { data: storyReports = [] } = useQuery({
    queryKey: ["story-reports", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("data,campaign_id,campaigns:campaign_id!inner(workspace_id)")
        .eq("type", "influencer")
        .eq("campaigns.workspace_id", current!.id);
      return (data ?? []) as any[];
    },
  });

  const storyEngByProfile = useMemo(() => {
    const m: Record<string, number[]> = {};
    storyReports.forEach((r: any) => {
      const d = r.data ?? {};
      if (String(d.platform).toLowerCase() !== "instagram") return;
      if (String(d.format).toLowerCase() !== "stories") return;
      const impressions = Number(d.impressions);
      if (!Number.isFinite(impressions) || impressions <= 0) return;
      const replies = Number(d.replies) || 0;
      const linkClicks = Number(d.link_clicks) || 0;
      const stickerTaps = Number(d.sticker_taps) || 0;
      const rate = ((replies + linkClicks + stickerTaps) / impressions) * 100;
      const pid = d.influencer_profile_id;
      if (!pid) return;
      (m[pid] ||= []).push(rate);
    });
    return m;
  }, [storyReports]);

  const allStoryRates = Object.values(storyEngByProfile).flat();
  const totals = {
    total: profiles.length,
    followers: profiles.reduce((a, p) => a + totalFollowers(p), 0),
    avgEng: allStoryRates.length
      ? allStoryRates.reduce((s, n) => s + n, 0) / allStoryRates.length
      : (() => {
          const all = Object.values(aggByProfile).flatMap((a) => a.engs);
          return all.length ? all.reduce((s, n) => s + n, 0) / all.length : 0;
        })(),
    activeCount: activeProfileIds.size,
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          <button
            onClick={() => setTab("available")}
            className={`rounded-sm px-3 py-1 ${tab === "available" ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            Available ({profiles.length - activeProfileIds.size})
          </button>
          <button
            onClick={() => setTab("active")}
            className={`rounded-sm px-3 py-1 ${tab === "active" ? "bg-accent font-medium" : "text-muted-foreground"}`}
          >
            In active campaigns ({activeProfileIds.size})
          </button>
        </div>
        <div className="relative flex-1 max-w-md min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, handle, platform" className="pl-9" />
        </div>
        <div className="inline-flex rounded-md border border-border p-0.5 text-xs">
          <button
            onClick={() => setView("grid")}
            className={`rounded-sm px-3 py-1 ${view === "grid" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            title="Grid view"
          >
            Grid
          </button>
          <button
            onClick={() => setView("list")}
            className={`rounded-sm px-3 py-1 ${view === "list" ? "bg-accent font-medium" : "text-muted-foreground"}`}
            title="List view"
          >
            List
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="surface-card p-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="surface-card flex flex-col items-center gap-2 p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {profiles.length === 0
              ? "No influencers yet — add your first one."
              : tab === "active" ? "Nobody is on an active campaign right now." : "No matches."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const agg = aggByProfile[p.id];
            const storyRates = storyEngByProfile[p.id] ?? [];
            const storyAvg = storyRates.length ? storyRates.reduce((s, n) => s + n, 0) / storyRates.length : null;
            const campaignAvg = agg && agg.engs.length ? agg.engs.reduce((s, n) => s + n, 0) / agg.engs.length : null;
            const avgEng = storyAvg ?? campaignAvg;
            const avgLabel = storyAvg != null ? `${storyAvg.toFixed(1)}% (stories)` : campaignAvg != null ? `${campaignAvg.toFixed(1)}%` : "—";
            const plats = normalizePlatforms(p);
            return (
              <Card key={p.id} className="group transition hover:shadow-sm">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent text-base font-semibold uppercase">
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.name} className="h-full w-full rounded-full object-cover" /> : p.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {plats[0]?.handle || "—"}
                      </p>
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
                    {plats.map((e, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px]">{e.platform}</Badge>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <Mini label="Followers" value={totalFollowers(p).toLocaleString()} />
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div><Mini label="Avg Eng." value={avgEng != null ? avgLabel : "—"} /></div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          <p className="font-medium">Instagram Stories engagement</p>
                          <p className="mt-1 font-mono text-[11px]">avg( (replies + link_clicks + sticker_taps) / impressions ) × 100</p>
                          <p className="mt-1 text-muted-foreground">Reports with 0 impressions are skipped. Falls back to per-campaign engagement when no story reports exist.</p>
                          {storyRates.length > 0 && <p className="mt-1 text-muted-foreground">Based on {storyRates.length} story report{storyRates.length === 1 ? "" : "s"}.</p>}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Mini label="Campaigns" value={(agg?.campaigns.size ?? 0).toString()} />
                  </div>
                  <ActivityDialog profile={p} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ActivityDialog({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useQuery({
    queryKey: ["influencer-activity", profile.id, open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("influencers")
        .select("id,campaign_id,engagement_rate,campaigns:campaign_id(id,name,status,start_date,end_date,university_name)")
        .eq("profile_id", profile.id);
      return data ?? [];
    },
  });

  const groups = useMemo(() => {
    const ongoing: any[] = [], done: any[] = [];
    rows.forEach((r: any) => {
      const c = r.campaigns;
      if (!c) return;
      if (c.status === "completed" || c.status === "cancelled") done.push({ ...c, engagement_rate: r.engagement_rate });
      else ongoing.push({ ...c, engagement_rate: r.engagement_rate });
    });
    return { ongoing, done };
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ActivityIcon className="h-3 w-3" /> View activity
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{profile.name} — Campaign activity</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <ActivitySection title="Ongoing" items={groups.ongoing} empty="No ongoing campaigns." />
          <ActivitySection title="Done" items={groups.done} empty="No completed campaigns yet." />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ActivitySection({ title, items, empty }: { title: string; items: any[]; empty: string }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2">
              <div className="min-w-0">
                <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">{c.name}</Link>
                <p className="truncate text-xs text-muted-foreground">{c.university_name} • <span className="capitalize">{c.status}</span></p>
              </div>
              {c.engagement_rate != null && (
                <span className="text-xs text-muted-foreground">{Number(c.engagement_rate).toFixed(1)}%</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlatformsEditor({ value, onChange }: { value: PlatformEntry[]; onChange: (v: PlatformEntry[]) => void }) {
  const add = () => onChange([...value, { platform: SOCIAL_PLATFORMS[0], handle: "", followers: null }]);
  const update = (i: number, patch: Partial<PlatformEntry>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">Platforms</Label>
        <Button type="button" size="sm" variant="outline" onClick={add} className="h-7 text-xs">
          <Plus className="mr-1 h-3 w-3" /> Add platform
        </Button>
      </div>
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">No platforms yet — click "Add platform".</p>
      ) : (
        <div className="space-y-2">
          {value.map((e, i) => (
            <div key={i} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[140px_1fr_120px_auto]">
              <Select value={e.platform} onValueChange={(v) => update(i, { platform: v })}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="h-8"
                placeholder={handlePlaceholder(e.platform)}
                value={e.handle}
                onChange={(ev) => update(i, { handle: ev.target.value })}
              />
              <Input
                className="h-8"
                type="number"
                placeholder="Followers"
                value={e.followers ?? ""}
                onChange={(ev) => update(i, { followers: ev.target.value ? Number(ev.target.value) : null })}
              />
              <Button type="button" size="icon" variant="ghost" onClick={() => remove(i)} className="h-8 w-8">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AvatarUploader({
  value,
  name,
  onChange,
}: { value: string; name: string; onChange: (url: string) => void }) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);

  const handle = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose an image");
    setUploading(true);
    const path = `${user.id}/influencers/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    onChange(data.publicUrl);
    setUploading(false);
  };

  return (
    <div className="flex items-center gap-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/20 to-accent text-lg font-semibold uppercase">
        {value ? <img src={value} alt={name} className="h-full w-full object-cover" /> : (name || "?").slice(0, 2)}
      </div>
      <div
        className={`flex-1 cursor-pointer rounded-md border-2 border-dashed p-3 text-center text-xs transition ${drag ? "border-primary bg-primary/5" : "border-border"}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handle(f);
        }}
      >
        <Upload className="mx-auto mb-1 h-4 w-4 text-muted-foreground" />
        {uploading ? "Uploading…" : "Click or drag an image"}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }}
        />
      </div>
      {value && (
        <Button type="button" size="icon" variant="ghost" onClick={() => onChange("")} title="Remove">
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

function NewInfluencerDialog({ onCreated }: { onCreated: () => void }) {
  const { current } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ name: string; avatar_url: string; platforms: PlatformEntry[] }>({
    name: "",
    avatar_url: "",
    platforms: [],
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (!current?.id) return toast.error("No workspace selected");
    setBusy(true);
    const primary = form.platforms[0];
    const totalF = form.platforms.reduce((s, e) => s + (e.followers ?? 0), 0);
    const { error } = await supabase.from("influencer_profiles").insert({
      workspace_id: current.id,
      name: form.name.trim(),
      platform: primary?.platform ?? null,
      handle: primary?.handle ?? null,
      followers: totalF || null,
      avatar_url: form.avatar_url || null,
      platforms: form.platforms as any,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Influencer added");
    setForm({ name: "", avatar_url: "", platforms: [] });
    setOpen(false);
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Add influencer</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New influencer</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <AvatarUploader value={form.avatar_url} name={form.name} onChange={(url) => setForm({ ...form, avatar_url: url })} />
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <PlatformsEditor value={form.platforms} onChange={(platforms) => setForm({ ...form, platforms })} />
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
    avatar_url: profile.avatar_url ?? "",
    platforms: normalizePlatforms(profile),
  });

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    setBusy(true);
    const primary = form.platforms[0];
    const totalF = form.platforms.reduce((s, e) => s + (e.followers ?? 0), 0);
    const { error } = await supabase
      .from("influencer_profiles")
      .update({
        name: form.name.trim(),
        platform: primary?.platform ?? null,
        handle: primary?.handle ?? null,
        followers: totalF || null,
        avatar_url: form.avatar_url || null,
        platforms: form.platforms as any,
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
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit influencer</DialogTitle></DialogHeader>
        <div className="grid gap-4">
          <AvatarUploader value={form.avatar_url} name={form.name} onChange={(url) => setForm({ ...form, avatar_url: url })} />
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <PlatformsEditor value={form.platforms} onChange={(platforms) => setForm({ ...form, platforms })} />
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
