import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, FileBarChart, FileText, FileSpreadsheet, Sparkles, Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { exportCampaignPdf, exportCampaignExcel } from "@/lib/exports";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

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
    const { error } = await supabase.from("campaigns").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["campaign", id] });
    toast.success("Status updated");
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
          <Button asChild size="sm">
            <Link to="/reports/new" search={{ campaign: campaign.id }}>
              <FileBarChart className="mr-2 h-4 w-4" /> Submit report
            </Link>
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
                <Row k="Budget" v={campaign.paid_budget ? `$${Number(campaign.paid_budget).toLocaleString()}` : "—"} />
                <Row k="Platforms" v={campaign.platforms?.join(", ") || "—"} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {influencers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Influencers ({influencers.length})</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Name</th><th>Platform</th><th>Followers</th><th>Cost</th><th>Engagement</th></tr>
              </thead>
              <tbody>
                {influencers.map((i: any) => (
                  <tr key={i.id} className="border-t border-border">
                    <td className="py-2">{i.name} <span className="text-xs text-muted-foreground">{i.handle}</span></td>
                    <td>{i.platform || "—"}</td>
                    <td>{i.followers?.toLocaleString() ?? "—"}</td>
                    <td>{i.cost ? `$${Number(i.cost).toLocaleString()}` : "—"}</td>
                    <td>{i.engagement_rate ? `${i.engagement_rate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-foreground">{summary}</div>
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
function Row({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right">{v || "—"}</span>
    </div>
  );
}
