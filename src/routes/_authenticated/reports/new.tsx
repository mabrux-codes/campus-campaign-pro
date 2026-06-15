import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2, Circle, Send } from "lucide-react";

const search = z.object({ campaign: z.string().optional() });

export const Route = createFileRoute("/_authenticated/reports/new")({
  validateSearch: (s) => search.parse(s),
  component: NewReport,
});

type Field = { key: string; label: string; type?: string; required?: boolean; min?: number };

const FIELDS: Record<string, Field[]> = {
  paid: [
    { key: "platform", label: "Platform", required: true },
    { key: "reach", label: "Reach", type: "number", min: 0 },
    { key: "impressions", label: "Impressions", type: "number", required: true, min: 0 },
    { key: "clicks", label: "Clicks", type: "number", required: true, min: 0 },
    { key: "ctr", label: "CTR (%)", type: "number", min: 0 },
    { key: "cpc", label: "CPC", type: "number", min: 0 },
    { key: "leads", label: "Leads generated", type: "number", min: 0 },
    { key: "conversions", label: "Conversions", type: "number", min: 0 },
    { key: "spend", label: "Amount spent", type: "number", required: true, min: 0 },
    { key: "roi", label: "ROI (%)", type: "number" },
  ],
  influencer: [
    { key: "platform", label: "Platform", required: true },
    { key: "content_type", label: "Content type" },
    { key: "views", label: "Views", type: "number", required: true, min: 0 },
    { key: "reach", label: "Reach", type: "number", min: 0 },
    { key: "engagement", label: "Engagement", type: "number", required: true, min: 0 },
    { key: "link_clicks", label: "Link clicks", type: "number", min: 0 },
    { key: "saves", label: "Saves", type: "number", min: 0 },
    { key: "shares", label: "Shares", type: "number", min: 0 },
    { key: "comments", label: "Comments", type: "number", min: 0 },
  ],
  influencer_ig_stories: [
    { key: "impressions", label: "Story impressions", type: "number", required: true, min: 0 },
    { key: "reach", label: "Reach", type: "number", min: 0 },
    { key: "replies", label: "Replies", type: "number", required: true, min: 0 },
    { key: "link_clicks", label: "Link / swipe-up clicks", type: "number", min: 0 },
    { key: "sticker_taps", label: "Sticker taps", type: "number", min: 0 },
    { key: "exits", label: "Exits", type: "number", min: 0 },
    { key: "forward_taps", label: "Forward taps", type: "number", min: 0 },
  ],
  organic: [
    { key: "platform", label: "Platform", required: true },
    { key: "posts", label: "Posts published", type: "number", required: true, min: 0 },
    { key: "reach", label: "Reach", type: "number", required: true, min: 0 },
    { key: "engagement", label: "Engagement", type: "number", required: true, min: 0 },
    { key: "shares", label: "Shares", type: "number", min: 0 },
    { key: "saves", label: "Saves", type: "number", min: 0 },
    { key: "profile_visits", label: "Profile visits", type: "number", min: 0 },
    { key: "website_clicks", label: "Website clicks", type: "number", min: 0 },
    { key: "leads", label: "Leads generated", type: "number", min: 0 },
  ],
};

type StepId = "campaign" | "type" | "metrics" | "review";
const STEPS: { id: StepId; label: string }[] = [
  { id: "campaign", label: "Choose campaign" },
  { id: "type", label: "Report type" },
  { id: "metrics", label: "Performance metrics" },
  { id: "review", label: "Review & submit" },
];

function NewReport() {
  const { campaign: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [campaignId, setCampaignId] = useState(preselected ?? "");
  const [type, setType] = useState<"paid" | "influencer" | "organic">("paid");
  const [isStories, setIsStories] = useState(false);
  const [influencerProfileId, setInfluencerProfileId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns-mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name,university_name,end_date,status,workspace_id")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedCampaignForWs = campaigns.find((c) => c.id === campaignId);
  const { data: workspaceProfiles = [] } = useQuery({
    queryKey: ["influencer-profiles-for-report", selectedCampaignForWs?.workspace_id],
    enabled: !!selectedCampaignForWs?.workspace_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("influencer_profiles")
        .select("id,name")
        .eq("workspace_id", selectedCampaignForWs!.workspace_id!)
        .order("name");
      return data ?? [];
    },
  });

  const fieldsKey = type === "influencer" && isStories ? "influencer_ig_stories" : type;
  const fields = FIELDS[fieldsKey];
  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (f.required && (!v || v.trim() === "")) out[f.key] = "Required";
      else if (f.type === "number" && v !== undefined && v !== "" && Number.isNaN(Number(v))) out[f.key] = "Must be a number";
      else if (f.type === "number" && f.min !== undefined && v && Number(v) < f.min) out[f.key] = `Must be ≥ ${f.min}`;
    }
    return out;
  }, [values, fields]);

  const stepValid = (i: number) => {
    if (i === 0) return !!campaignId;
    if (i === 1) {
      if (!type) return false;
      if (type === "influencer" && !influencerProfileId) return false;
      return true;
    }
    if (i === 2) return Object.keys(errors).length === 0;
    return true;
  };

  const overallProgress = ((step + (stepValid(step) ? 1 : 0)) / STEPS.length) * 100;

  const submit = async () => {
    if (!user || !campaignId) return toast.error("Missing campaign");
    if (type === "influencer" && !influencerProfileId) return toast.error("Pick an influencer");
    if (Object.keys(errors).length) {
      const all: Record<string, boolean> = {};
      fields.forEach((f) => (all[f.key] = true));
      setTouched(all);
      setStep(2);
      return toast.error("Please fix the highlighted fields");
    }
    setBusy(true);
    const data: Record<string, number | string> = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v === undefined || v === "") continue;
      data[f.key] = f.type === "number" ? Number(v) : v;
    }
    if (type === "influencer") {
      data.influencer_profile_id = influencerProfileId;
      if (isStories) {
        data.platform = "Instagram";
        data.format = "stories";
      }
    }
    const { error } = await supabase.from("reports").insert({
      campaign_id: campaignId,
      owner_id: user.id,
      type,
      data,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Report submitted");
    navigate({ to: "/reports" });
  };

  const next = () => {
    if (!stepValid(step)) {
      if (step === 2) {
        const all: Record<string, boolean> = {};
        fields.forEach((f) => (all[f.key] = true));
        setTouched(all);
      }
      return toast.error("Complete this step before continuing");
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const selectedCampaign = campaigns.find((c) => c.id === campaignId);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Submit report</h1>
        <p className="text-sm text-muted-foreground">A guided flow with inline validation.</p>
      </div>

      {/* Checklist */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Progress value={overallProgress} />
          <ol className="grid gap-2 sm:grid-cols-4">
            {STEPS.map((s, i) => {
              const done = i < step || (i === STEPS.length - 1 && step === STEPS.length - 1);
              const active = i === step;
              return (
                <li
                  key={s.id}
                  onClick={() => i <= step && setStep(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-xs ${
                    active ? "border-primary bg-accent/40" : done ? "border-primary/30" : "border-border opacity-60"
                  }`}
                >
                  {done ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
                  <span className="truncate">{s.label}</span>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">{STEPS[step].label}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <div className="space-y-2">
              <Label>Campaign</Label>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} — {c.university_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCampaign?.end_date && (
                <p className="text-xs text-muted-foreground">
                  Ends {selectedCampaign.end_date} · status {selectedCampaign.status}
                </p>
              )}
              {!campaignId && <p className="text-xs text-destructive">Pick a campaign to continue.</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Report type</Label>
                <Select value={type} onValueChange={(v) => { setType(v as typeof type); setValues({}); setTouched({}); setIsStories(false); setInfluencerProfileId(""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid ads</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="organic">Organic</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Determines which metrics you'll fill in next.</p>
              </div>
              {type === "influencer" && (
                <>
                  <div className="space-y-2">
                    <Label>Influencer <span className="text-destructive">*</span></Label>
                    <Select value={influencerProfileId} onValueChange={setInfluencerProfileId}>
                      <SelectTrigger><SelectValue placeholder="Pick an influencer" /></SelectTrigger>
                      <SelectContent>
                        {workspaceProfiles.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {workspaceProfiles.length === 0 && (
                      <p className="text-xs text-muted-foreground">No influencers in this workspace yet.</p>
                    )}
                  </div>
                  <label className="flex items-center gap-2 rounded-md border border-border p-3 text-sm">
                    <input type="checkbox" checked={isStories} onChange={(e) => { setIsStories(e.target.checked); setValues({}); setTouched({}); }} />
                    <span>Instagram Stories — capture story-specific metrics for engagement averaging</span>
                  </label>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((f) => {
                const err = touched[f.key] ? errors[f.key] : null;
                return (
                  <div key={f.key} className="space-y-1.5">
                    <Label className="flex items-center gap-1">
                      {f.label} {f.required && <span className="text-destructive">*</span>}
                    </Label>
                    <Input
                      type={f.type ?? "text"}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      onBlur={() => setTouched((t) => ({ ...t, [f.key]: true }))}
                      aria-invalid={!!err}
                      className={err ? "border-destructive" : ""}
                    />
                    {err && <p className="text-xs text-destructive">{err}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 text-sm">
              <SummaryRow k="Campaign" v={selectedCampaign ? `${selectedCampaign.name} — ${selectedCampaign.university_name}` : "—"} />
              <SummaryRow k="Type" v={type} />
              <div className="rounded-md border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.key} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{f.label}</td>
                        <td className="px-3 py-2 text-right font-medium">{values[f.key] || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setStep((s) => Math.max(s - 1, 0))} disabled={step === 0}>
              <ChevronLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={next}>
                Continue <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={busy || Object.keys(errors).length > 0}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Submit report
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border pb-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium capitalize">{v}</span>
    </div>
  );
}
