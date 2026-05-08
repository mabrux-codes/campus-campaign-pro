import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsList,
});

function ReportsList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["all-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id,type,created_at,data,campaign:campaigns(id,name,university_name,client_country)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Reports</h1>
          <p className="text-sm text-muted-foreground">Performance reports across all campaigns.</p>
        </div>
        <Button asChild>
          <Link to="/reports/new"><Plus className="mr-2 h-4 w-4" /> New report</Link>
        </Button>
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : data.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">No reports yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Campaign</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r: any) => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/campaigns/$id" params={{ id: r.campaign?.id }} className="hover:underline">
                      {r.campaign?.name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.campaign?.university_name}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{r.type}</Badge></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
