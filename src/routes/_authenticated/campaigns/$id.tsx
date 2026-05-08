import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ArrowLeft, FileBarChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/$id")({
  component: CampaignDetail,
});

function CampaignDetail() {
  const { id } = Route.useParams();

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
      const { data, error } = await supabase.from("influencers").select("*").eq("campaign_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: reports = [] } = useQuery({
    queryKey: ["reports", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("*").eq("campaign_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!campaign) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  const ended = campaign.end_date && new Date(campaign.end_date) < new Date();

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
        <Button asChild>
          <Link to="/reports/new" search={{ campaign: campaign.id }}>
            <FileBarChart className="mr-2 h-4 w-4" /> Submit report
          </Link>
        </Button>
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

      {campaign.uses_influencers && influencers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Influencers ({influencers.length})</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Name</th><th>Platform</th><th>Followers</th><th>Cost</th><th>Engagement</th></tr>
              </thead>
              <tbody>
                {influencers.map((i) => (
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
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reports submitted yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {reports.map((r) => (
                <li key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                  <span className="capitalize font-medium">{r.type} report</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
