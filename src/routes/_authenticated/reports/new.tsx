import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const search = z.object({ campaign: z.string().optional() });

export const Route = createFileRoute("/_authenticated/reports/new")({
  validateSearch: (s) => search.parse(s),
  component: NewReport,
});

const FIELDS: Record<string, { key: string; label: string; type?: string }[]> = {
  paid: [
    { key: "platform", label: "Platform" },
    { key: "reach", label: "Reach", type: "number" },
    { key: "impressions", label: "Impressions", type: "number" },
    { key: "clicks", label: "Clicks", type: "number" },
    { key: "ctr", label: "CTR (%)", type: "number" },
    { key: "cpc", label: "CPC", type: "number" },
    { key: "leads", label: "Leads generated", type: "number" },
    { key: "conversions", label: "Conversions", type: "number" },
    { key: "spend", label: "Amount spent", type: "number" },
    { key: "roi", label: "ROI (%)", type: "number" },
  ],
  influencer: [
    { key: "influencer", label: "Influencer name" },
    { key: "platform", label: "Platform" },
    { key: "content_type", label: "Content type" },
    { key: "views", label: "Views", type: "number" },
    { key: "reach", label: "Reach", type: "number" },
    { key: "engagement", label: "Engagement", type: "number" },
    { key: "link_clicks", label: "Link clicks", type: "number" },
    { key: "saves", label: "Saves", type: "number" },
    { key: "shares", label: "Shares", type: "number" },
    { key: "comments", label: "Comments", type: "number" },
  ],
  organic: [
    { key: "platform", label: "Platform" },
    { key: "posts", label: "Posts published", type: "number" },
    { key: "reach", label: "Reach", type: "number" },
    { key: "engagement", label: "Engagement", type: "number" },
    { key: "shares", label: "Shares", type: "number" },
    { key: "saves", label: "Saves", type: "number" },
    { key: "profile_visits", label: "Profile visits", type: "number" },
    { key: "website_clicks", label: "Website clicks", type: "number" },
    { key: "leads", label: "Leads generated", type: "number" },
  ],
};

function NewReport() {
  const { campaign: preselected } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [campaignId, setCampaignId] = useState(preselected ?? "");
  const [type, setType] = useState<"paid" | "influencer" | "organic">("paid");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns-mini"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id,name,university_name").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !campaignId) {
      toast.error("Choose a campaign first.");
      return;
    }
    setBusy(true);
    const data: Record<string, number | string> = {};
    for (const f of FIELDS[type]) {
      const v = values[f.key];
      if (v === undefined || v === "") continue;
      data[f.key] = f.type === "number" ? Number(v) : v;
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Submit report</h1>
        <p className="text-sm text-muted-foreground">Capture performance for a campaign.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Campaign</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
                  <SelectContent>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.university_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Report type</Label>
                <Select value={type} onValueChange={(v) => { setType(v as typeof type); setValues({}); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">Paid ads</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="organic">Organic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              {FIELDS[type].map((f) => (
                <div key={f.key} className="space-y-2">
                  <Label>{f.label}</Label>
                  <Input
                    type={f.type ?? "text"}
                    value={values[f.key] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit report
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
