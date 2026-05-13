import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";

export type PendingReport = {
  id: string;
  name: string;
  university_name: string;
  end_date: string;
};

export function usePendingReports() {
  const { current } = useWorkspace();
  return useQuery({
    queryKey: ["pending-reports", current?.id],
    enabled: !!current?.id,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id,name,university_name,end_date")
        .eq("workspace_id", current!.id)
        .not("end_date", "is", null)
        .lte("end_date", today)
        .order("end_date", { ascending: false });
      const list = (campaigns ?? []) as PendingReport[];
      if (list.length === 0) return [] as PendingReport[];
      const ids = list.map((c) => c.id);
      const { data: reports } = await supabase
        .from("reports")
        .select("campaign_id")
        .in("campaign_id", ids);
      const submitted = new Set((reports ?? []).map((r: any) => r.campaign_id));
      return list.filter((c) => !submitted.has(c.id));
    },
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
}
