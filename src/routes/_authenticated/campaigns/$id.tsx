import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, FileBarChart, FileText, FileSpreadsheet, Sparkles, Loader2, Upload, Image as ImageIcon, Pencil, Plus, Trash2, Save, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { exportCampaignPdf, exportCampaignExcel } from "@/lib/exports";
import { useAuth } from "@/lib/auth";
import { useCurrency, formatMoney, type Currency } from "@/lib/currency";
import { getRates, convert } from "@/lib/fx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function BudgetDisplay({ amount, currency }: { amount: number; currency: Currency }) {
  const [kes, setKes] = useState<number | null>(null);
  useEffect(() => {
    if (currency === "KES") return;
    getRates().then((r) => {
      if (!r) return;
      const v = convert(amount, currency, "KES", r.rates);
      if (v != null) setKes(v);
    });
  }, [amount, currency]);
  if (currency === "KES") return <>{formatMoney(amount, "KES")}</>;
  return (
    <span>
      {formatMoney(amount, currency)}
      {kes != null && <span className="ml-2 text-xs text-muted-foreground">≈ {formatMoney(kes, "KES")}</span>}
    </span>
  );
}

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { currency } = useCurrency();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  const deleteCampaign = async () => {
    if (!confirm("Delete this campaign? This will also delete its reports, attachments, and influencer entries. This cannot be undone.")) return;
    setDeleting(true);
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    setDeleting(false);
    if (error) return toast.error(error.message);
    toast.success("Campaign deleted");
    qc.invalidateQueries({ queryKey: ["campaigns-list"] });
    navigate({ to: "/campaigns" });
  };

  const { data: campaign } = useQuery({
    queryKey: ["campaign", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: influencers = [] } = useQuery({
    queryKey: ["influencers", id],
    queryFn: async () => {
      const { data } = await supabase.from("influencers").select("*").eq("campaign_id", id);
      return data ?? [];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["reports", id],
    queryFn: async () => {
      const { data } = await supabase.from("reports").select("*").eq("campaign_id", id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["attachments", id],
    enabled: reports.length > 0,
    queryFn: async () => {
      const ids = reports.map((r: any) => r.id);
      const { data } = await supabase.from("report_attachments").select("*").in("report_id", ids);
      return data ?? [];
    },
  });

  const [exporting, setExporting] = useState<"pdf" | "xlsx" | null>(null);

  if (!campaign) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const ended = campaign.end_date && new Date(campaign.end_date) < new Date();

  const attsByReport: Record<string, any[]> = {};
  attachments.forEach((a: any) => {
    (attsByReport[a.report_id] ||= []).push(a);
  });

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("campaigns").update({ status: status as any }).eq("id", id);
    if (error) {
      const msg = error.message ?? "";
      if (msg.includes("without start and end dates")) {
        toast.error("Add a start and end date before activating or completing this campaign.");
      } else if (msg.includes("before its end date")) {
        toast.error("This campaign can only be marked Completed on or after its end date.");
      } else {
        toast.error(msg || "Failed to update status");
      }
      return;
    }
    qc.invalidateQueries({ queryKey: ["campaign", id] });
    toast.success(`Status updated to ${status}`);
  };

  const doExportPdf = async () => {
    setExporting("pdf");
    const attMap: Record<string, any[]> = {};
    for (const r of reports as any[]) {
      attMap[r.id] = (attsByReport[r.id] ?? []).map((a) => ({
        id: a.id,
        file_name: a.file_name,
        url: supabase.storage.from("campaign-files").getPublicUrl(a.file_path).data.publicUrl,
      }));
    }
    try {
      await exportCampaignPdf(campaign as any, reports as any, attMap);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
    setExporting(null);
  };

  const doExportExcel = () => {
    setExporting("xlsx");
    try {
      exportCampaignExcel(campaign as any, reports as any);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    }
    setExporting(null);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/campaigns"><ArrowLeft className="mr-2 h-4 w-4" /> All campaigns</Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{campaign.university_name}</p>
          <h1 className="font-display text-4xl">{campaign.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline" className="capitalize">{campaign.type}</Badge>
            <Badge variant="outline" className="capitalize">{campaign.status}</Badge>
            {campaign.start_date && campaign.end_date && (
              <span className="text-muted-foreground">
                {format(new Date(campaign.start_date), "MMM d")} → {format(new Date(campaign.end_date), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={doExportPdf} disabled={exporting !== null}>
            {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />} PDF
          </Button>
          <Button variant="outline" size="sm" onClick={doExportExcel} disabled={exporting !== null}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          {reports.length === 0 && (
            <Button asChild size="sm">
              <Link to="/reports/new" search={{ campaign: campaign.id }}>
                <FileBarChart className="mr-2 h-4 w-4" /> Submit report
              </Link>
            </Button>
          )}
          <Button variant="destructive" size="sm" onClick={deleteCampaign} disabled={deleting}>
            {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-foreground self-center">Quick status:</span>
        {["draft", "active", "paused", "completed"].map((s) => (
          <Button key={s} size="sm" variant={campaign.status === s ? "default" : "outline"} onClick={() => updateStatus(s)} className="h-7 capitalize">
            {s}
          </Button>
        ))}
      </div>

      {ended && reports.length === 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
          This campaign has ended. <Link to="/reports/new" search={{ campaign: campaign.id }} className="font-medium underline">Submit its performance report</Link>.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Brief</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Section title="Description" body={campaign.description} />
            <Section title="Objectives" body={campaign.objectives} />
            <Section title="Deliverables" body={campaign.deliverables} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Client & setup</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Country" v={campaign.client_country} />
            <Row k="Contact" v={campaign.contact_person} />
            <Row k="Email" v={campaign.contact_email} />
            <Row k="Phone" v={campaign.contact_phone} />
            {campaign.type === "paid" && (
              <>
                <Row k="Budget" v={campaign.paid_budget ? <BudgetDisplay amount={Number(campaign.paid_budget)} currency={currency} /> : "—"} />
                <Row k="Platforms" v={campaign.platforms?.join(", ") || "—"} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <CampaignEditor campaign={campaign} onSaved={() => qc.invalidateQueries({ queryKey: ["campaign", id] })} />

      <InfluencersEditor
        campaignId={id}
        influencers={influencers as any[]}
        onChanged={() => qc.invalidateQueries({ queryKey: ["influencers", id] })}
      />

      <Card>
        <CardHeader><CardTitle className="text-sm font-medium">Reports ({reports.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports submitted yet.</p>
          ) : (
            reports.map((r: any) => (
              <ReportRow
                key={r.id}
                report={r}
                attachments={attsByReport[r.id] ?? []}
                userId={user?.id}
                onChanged={() => {
                  qc.invalidateQueries({ queryKey: ["reports", id] });
                  qc.invalidateQueries({ queryKey: ["attachments", id] });
                }}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportRow({ report, attachments, userId, onChanged }: { report: any; attachments: any[]; userId?: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(report.ai_summary);
  const fileRef = useRef<HTMLInputElement>(null);

  const generate = async () => {
    setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-report-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ reportId: report.id }),
    });
    setBusy(false);
    const j = await res.json();
    if (!res.ok) return toast.error(j.error ?? "Failed to summarize");
    setSummary(j.summary);
    onChanged();
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !userId) return;
    for (const f of files) {
      const path = `${userId}/${report.id}/${Date.now()}-${f.name}`;
      const { error: upErr } = await supabase.storage.from("campaign-files").upload(path, f, { contentType: f.type });
      if (upErr) { toast.error(upErr.message); continue; }
      await supabase.from("report_attachments").insert({
        report_id: report.id, uploader_id: userId, file_path: path, file_name: f.name, content_type: f.type,
      });
    }
    if (fileRef.current) fileRef.current.value = "";
    onChanged();
    toast.success("Screenshots uploaded");
  };

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium capitalize">{report.type} report</p>
          <p className="text-xs text-muted-foreground">{format(new Date(report.created_at), "MMM d, yyyy 'at' p")}</p>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-2 h-3.5 w-3.5" /> Screenshots
          </Button>
          <input ref={fileRef} type="file" multiple accept="image/*" className="hidden" onChange={onUpload} />
          <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />}
            {summary ? "Regenerate" : "AI summary"}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
        {Object.entries(report.data ?? {}).slice(0, 6).map(([k, v]) => (
          <div key={k} className="rounded bg-muted/40 px-2 py-1">
            <p className="text-muted-foreground capitalize">{k.replaceAll("_", " ")}</p>
            <p className="font-medium">{String(v)}</p>
          </div>
        ))}
      </div>

      {attachments.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {attachments.map((a) => {
            const url = supabase.storage.from("campaign-files").getPublicUrl(a.file_path).data.publicUrl;
            return (
              <a key={a.id} href={url} target="_blank" rel="noreferrer" className="group block aspect-square overflow-hidden rounded border border-border">
                {a.content_type?.startsWith("image/") ? (
                  <img src={url} alt={a.file_name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center"><ImageIcon className="h-5 w-5 text-muted-foreground" /></div>
                )}
              </a>
            );
          })}
        </div>
      )}

      {summary && (
        <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI insights
          </p>
          <div className="ai-markdown text-sm text-foreground">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: (p) => <h3 className="mt-3 mb-1 text-base font-semibold" {...p} />,
                h2: (p) => <h3 className="mt-3 mb-1 text-base font-semibold" {...p} />,
                h3: (p) => <h4 className="mt-3 mb-1 text-sm font-semibold" {...p} />,
                h4: (p) => <h5 className="mt-2 mb-1 text-sm font-semibold" {...p} />,
                p: (p) => <p className="mb-2 leading-relaxed" {...p} />,
                ul: (p) => <ul className="mb-2 ml-5 list-disc space-y-1" {...p} />,
                ol: (p) => <ol className="mb-2 ml-5 list-decimal space-y-1" {...p} />,
                li: (p) => <li className="leading-relaxed" {...p} />,
                strong: (p) => <strong className="font-semibold text-foreground" {...p} />,
                code: (p) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...p} />,
              }}
            >
              {summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 whitespace-pre-wrap">{body || "—"}</p>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v || "—"}</span>
    </div>
  );
}

const PLATFORMS = ["Meta Ads", "TikTok Ads", "Google Ads", "LinkedIn Ads", "X/Twitter Ads"];

function CampaignEditor({ campaign, onSaved }: { campaign: any; onSaved: () => void }) {
  const { currency } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    description: campaign.description ?? "",
    objectives: campaign.objectives ?? "",
    deliverables: campaign.deliverables ?? "",
    start_date: campaign.start_date ?? "",
    end_date: campaign.end_date ?? "",
    type: campaign.type as "paid" | "organic",
    paid_budget: campaign.paid_budget?.toString() ?? "",
    platforms: (campaign.platforms ?? []) as string[],
    uses_influencers: !!campaign.uses_influencers,
  });

  const togglePlatform = (p: string) =>
    setForm((f) => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter((x) => x !== p) : [...f.platforms, p] }));

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("campaigns").update({
      description: form.description || null,
      objectives: form.objectives || null,
      deliverables: form.deliverables || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      type: form.type,
      paid_budget: form.type === "paid" && form.paid_budget ? Number(form.paid_budget) : null,
      platforms: form.type === "paid" ? form.platforms : [],
      uses_influencers: form.type === "paid" && form.uses_influencers,
    }).eq("id", campaign.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Campaign updated");
    setEditing(false);
    onSaved();
  };

  if (!editing) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium capitalize">{campaign.type} campaign details</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Edit
          </Button>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Row k="Type" v={campaign.type} />
          <Row k="Window" v={campaign.start_date && campaign.end_date ? `${campaign.start_date} → ${campaign.end_date}` : "—"} />
          {campaign.type === "paid" && (
            <>
              <Row k="Budget" v={campaign.paid_budget ? <BudgetDisplay amount={Number(campaign.paid_budget)} currency={currency} /> : "—"} />
              <Row k="Platforms" v={campaign.platforms?.join(", ") || "—"} />
              <Row k="Uses influencers" v={campaign.uses_influencers ? "Yes" : "No"} />
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Edit campaign</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            <X className="mr-2 h-3.5 w-3.5" /> Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />} Save
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Start date</Label>
            <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End date</Label>
            <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <select className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as any })}>
              <option value="organic">Organic</option>
              <option value="paid">Paid</option>
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Objectives</Label>
            <Textarea rows={3} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Deliverables</Label>
            <Textarea rows={3} value={form.deliverables} onChange={(e) => setForm({ ...form, deliverables: e.target.value })} />
          </div>
        </div>
        {form.type === "paid" && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Total ads budget ($)</Label>
              <Input type="number" value={form.paid_budget} onChange={(e) => setForm({ ...form, paid_budget: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Platforms</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {PLATFORMS.map((p) => (
                  <label key={p} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
                    <Checkbox checked={form.platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                    {p}
                  </label>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.uses_influencers} onCheckedChange={(v) => setForm({ ...form, uses_influencers: !!v })} />
              Uses influencers
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfluencersEditor({ campaignId, influencers, onChanged }: { campaignId: string; influencers: any[]; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", handle: "", platform: "", followers: "", cost: "", engagement_rate: "" });

  const add = async () => {
    if (!draft.name.trim()) return toast.error("Name is required");
    const { error } = await supabase.from("influencers").insert({
      campaign_id: campaignId,
      name: draft.name,
      handle: draft.handle || null,
      platform: draft.platform || null,
      followers: draft.followers ? Number(draft.followers) : null,
      cost: draft.cost ? Number(draft.cost) : null,
      engagement_rate: draft.engagement_rate ? Number(draft.engagement_rate) : null,
    });
    if (error) return toast.error(error.message);
    setDraft({ name: "", handle: "", platform: "", followers: "", cost: "", engagement_rate: "" });
    setAdding(false);
    onChanged();
    toast.success("Influencer added");
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("influencers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChanged();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-medium">Influencers ({influencers.length})</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <Plus className="mr-2 h-3.5 w-3.5" /> Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
            <Input placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <Input placeholder="Handle" value={draft.handle} onChange={(e) => setDraft({ ...draft, handle: e.target.value })} />
            <Input placeholder="Platform" value={draft.platform} onChange={(e) => setDraft({ ...draft, platform: e.target.value })} />
            <Input placeholder="Followers" type="number" value={draft.followers} onChange={(e) => setDraft({ ...draft, followers: e.target.value })} />
            <Input placeholder="Cost" type="number" value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
            <Input placeholder="Engagement %" type="number" value={draft.engagement_rate} onChange={(e) => setDraft({ ...draft, engagement_rate: e.target.value })} />
            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
              <Button size="sm" onClick={add}>Save</Button>
            </div>
          </div>
        )}
        {influencers.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">No influencers yet.</p>
        ) : influencers.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Name</th><th>Platform</th><th>Followers</th><th>Cost</th><th>Engagement</th><th></th></tr>
            </thead>
            <tbody>
              {influencers.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="py-2">{i.name} <span className="text-xs text-muted-foreground">{i.handle}</span></td>
                  <td>{i.platform || "—"}</td>
                  <td>{i.followers?.toLocaleString() ?? "—"}</td>
                  <td>{i.cost ? `$${Number(i.cost).toLocaleString()}` : "—"}</td>
                  <td>{i.engagement_rate ? `${i.engagement_rate}%` : "—"}</td>
                  <td className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => remove(i.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
