import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  component: NewCampaign,
});

const PLATFORMS = ["Meta Ads", "TikTok Ads", "Google Ads", "LinkedIn Ads", "X/Twitter Ads"];

type Influencer = {
  name: string;
  handle: string;
  platform: string;
  followers: string;
  deliverable_type: string;
  cost: string;
  engagement_rate: string;
};

function NewCampaign() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    university_name: "",
    client_country: "",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    name: "",
    description: "",
    objectives: "",
    deliverables: "",
    start_date: "",
    end_date: "",
    status: "draft" as "draft" | "active" | "completed" | "paused",
    type: "organic" as "paid" | "organic",
    paid_budget: "",
    platforms: [] as string[],
    uses_influencers: false,
  });
  const [influencers, setInfluencers] = useState<Influencer[]>([]);

  const upd = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const togglePlatform = (p: string) =>
    upd("platforms", form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : [...form.platforms, p]);

  const addInfluencer = () =>
    setInfluencers((arr) => [
      ...arr,
      { name: "", handle: "", platform: "", followers: "", deliverable_type: "", cost: "", engagement_rate: "" },
    ]);

  const submit = async () => {
    if (!user) return;
    if (!form.name || !form.university_name) {
      toast.error("Campaign name and client name are required.");
      setStep(1);
      return;
    }
    setBusy(true);
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        owner_id: user.id,
        workspace_id: current?.id ?? null,
        university_name: form.university_name,
        client_country: form.client_country || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        name: form.name,
        description: form.description || null,
        objectives: form.objectives || null,
        deliverables: form.deliverables || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        type: form.type,
        paid_budget: form.type === "paid" && form.paid_budget ? Number(form.paid_budget) : null,
        platforms: form.type === "paid" ? form.platforms : [],
        uses_influencers: form.type === "paid" && form.uses_influencers,
      })
      .select("id")
      .single();

    if (error || !campaign) {
      setBusy(false);
      toast.error(error?.message ?? "Failed to create campaign");
      return;
    }

    if (form.type === "paid" && form.uses_influencers && influencers.length > 0) {
      const rows = influencers
        .filter((i) => i.name)
        .map((i) => ({
          campaign_id: campaign.id,
          name: i.name,
          handle: i.handle || null,
          platform: i.platform || null,
          followers: i.followers ? Number(i.followers) : null,
          deliverable_type: i.deliverable_type || null,
          cost: i.cost ? Number(i.cost) : null,
          engagement_rate: i.engagement_rate ? Number(i.engagement_rate) : null,
        }));
      if (rows.length) await supabase.from("influencers").insert(rows);
    }

    setBusy(false);
    toast.success("Campaign created");
    navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  };

  const totalSteps = form.type === "paid" ? 4 : 3;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Step {step} of {totalSteps}</p>
          <h1 className="font-display text-4xl">New campaign</h1>
        </div>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-border"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Client</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="University / Client name *" value={form.university_name} onChange={(v) => upd("university_name", v)} />
            <Field label="Country" value={form.client_country} onChange={(v) => upd("client_country", v)} />
            <Field label="Contact person" value={form.contact_person} onChange={(v) => upd("contact_person", v)} />
            <Field label="Contact email" type="email" value={form.contact_email} onChange={(v) => upd("contact_email", v)} />
            <Field label="Contact phone" value={form.contact_phone} onChange={(v) => upd("contact_phone", v)} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Campaign details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Campaign name *" value={form.name} onChange={(v) => upd("name", v)} />
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => upd("description", e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Objectives</Label>
              <Textarea value={form.objectives} onChange={(e) => upd("objectives", e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Deliverables</Label>
              <Textarea value={form.deliverables} onChange={(e) => upd("deliverables", e.target.value)} rows={3} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Start date" type="date" value={form.start_date} onChange={(v) => upd("start_date", v)} />
              <Field label="End date" type="date" value={form.end_date} onChange={(v) => upd("end_date", v)} />
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => upd("status", v as typeof form.status)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.start_date && form.end_date && (
              <p className="text-xs text-muted-foreground">
                Duration: {Math.max(0, Math.ceil((+new Date(form.end_date) - +new Date(form.start_date)) / 86400000))} days
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Type</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["organic", "paid"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => upd("type", t)}
                  className={`rounded-lg border p-4 text-left transition ${
                    form.type === t ? "border-primary bg-accent/40" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <p className="font-medium capitalize">{t} campaign</p>
                  <p className="text-xs text-muted-foreground">
                    {t === "organic" ? "Owned channels, no media spend." : "Paid media spend across ad platforms."}
                  </p>
                </button>
              ))}
            </div>

            {form.type === "paid" && (
              <div className="space-y-4 border-t border-border pt-4">
                <Field label="Total ads budget" type="number" value={form.paid_budget} onChange={(v) => upd("paid_budget", v)} />
                <div className="space-y-2">
                  <Label>Platforms</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PLATFORMS.map((p) => (
                      <label key={p} className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm">
                        <Checkbox checked={form.platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Use influencers?</p>
                    <p className="text-xs text-muted-foreground">Add creators in the next step.</p>
                  </div>
                  <Switch checked={form.uses_influencers} onCheckedChange={(v) => upd("uses_influencers", v)} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 4 && form.type === "paid" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base font-medium">
              Influencers
              {form.uses_influencers && (
                <Button size="sm" variant="outline" onClick={addInfluencer}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!form.uses_influencers ? (
              <p className="text-sm text-muted-foreground">No influencers selected for this campaign.</p>
            ) : influencers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add your first influencer to get started.</p>
            ) : (
              influencers.map((inf, idx) => (
                <div key={idx} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                  <Field label="Name" value={inf.name} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, name: v } : x)))} />
                  <Field label="Handle" value={inf.handle} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, handle: v } : x)))} />
                  <Field label="Platform" value={inf.platform} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, platform: v } : x)))} />
                  <Field label="Followers" type="number" value={inf.followers} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, followers: v } : x)))} />
                  <Field label="Deliverable" value={inf.deliverable_type} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, deliverable_type: v } : x)))} />
                  <Field label="Cost" type="number" value={inf.cost} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, cost: v } : x)))} />
                  <Field label="Engagement %" type="number" value={inf.engagement_rate} onChange={(v) => setInfluencers((a) => a.map((x, i) => (i === idx ? { ...x, engagement_rate: v } : x)))} />
                  <div className="flex items-end">
                    <Button variant="ghost" size="sm" onClick={() => setInfluencers((a) => a.filter((_, i) => i !== idx))}>
                      <Trash2 className="mr-2 h-4 w-4" /> Remove
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {step < totalSteps ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create campaign
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
