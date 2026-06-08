import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { usePendingReports } from "@/lib/pending-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Megaphone, Activity, CheckCircle2, DollarSign, Sprout, Users, FileBarChart, Plus, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "completed" | "paused";
  type: "paid" | "organic";
  uses_influencers: boolean;
  end_date: string | null;
  university_name: string;
  created_at: string;
};

function Dashboard() {
  const { user } = useAuth();
  const { current } = useWorkspace();

  const { data: campaigns = [] } = useQuery({
    queryKey: ["campaigns", user?.id, current?.id ?? "all"],
    queryFn: async () => {
      let query = supabase
        .from("campaigns")
        .select("id,name,status,type,uses_influencers,end_date,university_name,created_at,workspace_id")
        .order("created_at", { ascending: false });
      if (current?.id) query = query.eq("workspace_id", current.id);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Campaign[];
    },
    enabled: !!user,
  });

  const { data: pendingReports = [] } = usePendingReports();

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === "active").length,
    completed: campaigns.filter((c) => c.status === "completed").length,
    paid: campaigns.filter((c) => c.type === "paid").length,
    organic: campaigns.filter((c) => c.type === "organic").length,
    influencer: campaigns.filter((c) => c.uses_influencers).length,
  };

  const upcoming = campaigns
    .filter((c) => c.end_date && new Date(c.end_date) >= new Date())
    .sort((a, b) => (a.end_date! < b.end_date! ? -1 : 1))
    .slice(0, 5);

  // Monthly performance: campaigns created per month, last 6
  const months = Array.from({ length: 6 }).map((_, i) => {
    const d = startOfMonth(subMonths(new Date(), 5 - i));
    return {
      month: format(d, "MMM"),
      key: format(d, "yyyy-MM"),
      count: 0,
    };
  });
  campaigns.forEach((c) => {
    const k = format(new Date(c.created_at), "yyyy-MM");
    const m = months.find((x) => x.key === k);
    if (m) m.count += 1;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Welcome back</p>
          <h1 className="font-display text-4xl">Your campaigns at a glance</h1>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="mr-2 h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={<Megaphone className="h-4 w-4" />} label="Total" value={stats.total} />
        <KpiCard icon={<Activity className="h-4 w-4" />} label="Active" value={stats.active} accent />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed" value={stats.completed} />
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Paid" value={stats.paid} />
        <KpiCard icon={<Sprout className="h-4 w-4" />} label="Organic" value={stats.organic} />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Influencer" value={stats.influencer} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Monthly performance</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={months}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-medium">Upcoming reports</CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
                  <FileBarChart className="h-6 w-6" />
                  Nothing due — you're all caught up.
                </div>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.university_name}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(c.end_date!), "MMM d")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className={pendingReports.length > 0 ? "border-warning/50" : undefined}>
            <CardHeader>
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <AlertCircle className={`h-4 w-4 ${pendingReports.length > 0 ? "text-warning" : "text-muted-foreground"}`} />
                Pending reports
                {pendingReports.length > 0 && (
                  <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                    {pendingReports.length}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingReports.length === 0 ? (
                <p className="py-2 text-center text-sm text-muted-foreground">No pending reports.</p>
              ) : (
                <ul className="space-y-3">
                  {pendingReports.slice(0, 5).map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">{c.university_name}</p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-7 shrink-0 text-xs">
                        <Link to="/reports/new" search={{ campaign: c.id }}>Submit</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className={`surface-card p-4 ${accent ? "border-primary/40 bg-accent/40" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-display text-3xl">{value}</p>
    </div>
  );
}
