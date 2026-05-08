import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: Analytics,
});

const COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function Analytics() {
  const { data: campaigns = [] } = useQuery({
    queryKey: ["analytics-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns").select("id,name,type,client_country,status");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byCountry = Object.entries(
    campaigns.reduce<Record<string, number>>((acc, c) => {
      const k = c.client_country || "Unknown";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([country, count]) => ({ country, count }));

  const byType = [
    { name: "Paid", value: campaigns.filter((c) => c.type === "paid").length },
    { name: "Organic", value: campaigns.filter((c) => c.type === "organic").length },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Analytics</h1>
        <p className="text-sm text-muted-foreground">Trends across your portfolio.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Campaigns by country</CardTitle></CardHeader>
          <CardContent className="h-72">
            {byCountry.length === 0 ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCountry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="country" stroke="var(--color-muted-foreground)" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Paid vs organic mix</CardTitle></CardHeader>
          <CardContent className="h-72">
            {byType.every((b) => b.value === 0) ? (
              <Empty />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byType} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3}>
                    {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Legend />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data yet — create a campaign to see insights.
    </div>
  );
}
