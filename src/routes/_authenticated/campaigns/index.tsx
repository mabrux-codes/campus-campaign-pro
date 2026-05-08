import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  component: CampaignList,
});

function CampaignList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["campaigns-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaigns")
        .select("id,name,status,type,university_name,client_country,start_date,end_date,paid_budget")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = data.filter((c) => {
    if (status !== "all" && c.status !== status) return false;
    if (q && !`${c.name} ${c.university_name}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Campaigns</h1>
          <p className="text-sm text-muted-foreground">All your university campaigns in one place.</p>
        </div>
        <Button asChild>
          <Link to="/campaigns/new">
            <Plus className="mr-2 h-4 w-4" /> New campaign
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or client" className="pl-9" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No campaigns yet.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/campaigns/new">Create your first campaign</Link>
            </Button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Window</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link to="/campaigns/$id" params={{ id: c.id }} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {c.university_name} {c.client_country ? `· ${c.client_country}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="capitalize">{c.type}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {c.start_date ? format(new Date(c.start_date), "MMM d") : "—"}
                    {" → "}
                    {c.end_date ? format(new Date(c.end_date), "MMM d, yyyy") : "—"}
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    active: "bg-primary/15 text-primary border-primary/30",
    paused: "bg-warning/20 text-warning-foreground",
    completed: "bg-success/15 text-success border-success/30",
  };
  return (
    <span className={`inline-flex rounded-md border border-transparent px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? ""}`}>
      {status}
    </span>
  );
}
