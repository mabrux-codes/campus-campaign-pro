import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { useCurrency, formatMoney } from "@/lib/currency";

export const Route = createFileRoute("/_authenticated/influencers")({
  component: InfluencersPage,
});

function InfluencersPage() {
  const [q, setQ] = useState("");
  const { currency } = useCurrency();
  const { data = [], isLoading } = useQuery({
    queryKey: ["influencers-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("influencers")
        .select("id,name,handle,platform,followers,cost,engagement_rate,deliverable_type,campaign:campaigns(id,name,university_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(
    () =>
      data.filter((i: any) =>
        !q ||
        `${i.name} ${i.handle} ${i.platform} ${i.campaign?.name ?? ""}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [data, q],
  );

  const totals = useMemo(
    () => ({
      total: data.length,
      followers: data.reduce((a: number, i: any) => a + (i.followers ?? 0), 0),
      cost: data.reduce((a: number, i: any) => a + (Number(i.cost) || 0), 0),
      avgEng:
        data.length > 0
          ? data.reduce((a: number, i: any) => a + (Number(i.engagement_rate) || 0), 0) / data.length
          : 0,
    }),
    [data],
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Influencers</h1>
        <p className="text-sm text-muted-foreground">All creators across your campaigns.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Influencers" value={totals.total.toString()} />
        <Stat label="Total followers" value={totals.followers.toLocaleString()} />
        <Stat label="Total spend" value={formatMoney(totals.cost, currency)} />
        <Stat label="Avg engagement" value={`${totals.avgEng.toFixed(1)}%`} />
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, handle, platform, campaign" className="pl-9" />
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No influencers yet — add them when creating a paid campaign.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Followers</th>
                <th className="px-4 py-3">Cost</th>
                <th className="px-4 py-3">Engagement</th>
                <th className="px-4 py-3">Campaign</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((i: any) => (
                <tr key={i.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium">{i.name}</p>
                    {i.handle && <p className="text-xs text-muted-foreground">{i.handle}</p>}
                  </td>
                  <td className="px-4 py-3">{i.platform ? <Badge variant="outline">{i.platform}</Badge> : "—"}</td>
                  <td className="px-4 py-3">{i.followers?.toLocaleString() ?? "—"}</td>
                  <td className="px-4 py-3">{i.cost ? formatMoney(Number(i.cost), currency) : "—"}</td>
                  <td className="px-4 py-3">{i.engagement_rate ? `${i.engagement_rate}%` : "—"}</td>
                  <td className="px-4 py-3">
                    {i.campaign ? (
                      <Link to="/campaigns/$id" params={{ id: i.campaign.id }} className="hover:underline">
                        {i.campaign.name}
                      </Link>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
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
