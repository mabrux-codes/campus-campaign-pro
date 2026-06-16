import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { toast } from "sonner";
import { ShieldAlert } from "lucide-react";
import { createElement } from "react";

export type SecurityFinding = {
  id: string;
  workspace_id: string | null;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  source: string;
  status: "open" | "resolved" | "ignored";
  acknowledged_by: string[] | null;
  created_at: string;
};

type Ctx = {
  findings: SecurityFinding[];
  unackHighCount: number;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  acknowledge: (id: string) => Promise<void>;
  resolve: (id: string) => Promise<void>;
};

const C = createContext<Ctx>({
  findings: [],
  unackHighCount: 0,
  isAdmin: false,
  refresh: async () => {},
  acknowledge: async () => {},
  resolve: async () => {},
});

function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(520, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.42);
  } catch { /* ignore */ }
}

export function SecurityAlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { current } = useWorkspace();
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const isAdmin = current?.role === "owner" || current?.role === "admin";

  const refresh = async () => {
    if (!user || !isAdmin) { setFindings([]); return; }
    const { data } = await supabase
      .from("security_findings" as any)
      .select("id,workspace_id,severity,title,description,source,status,acknowledged_by,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setFindings(((data ?? []) as unknown) as SecurityFinding[]);
  };

  useEffect(() => {
    if (!user || !isAdmin) { setFindings([]); return; }
    refresh();
    const ch = supabase
      .channel("security-findings:" + user.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "security_findings" },
        (payload) => {
          const n = payload.new as unknown as SecurityFinding;
          setFindings((f) => [n, ...f]);
          if (n.severity === "high" || n.severity === "critical") {
            toast.error(`Security: ${n.title}`, {
              description: n.description ?? `New ${n.severity} finding from ${n.source}`,
              icon: createElement(ShieldAlert, { className: "h-4 w-4" }),
              duration: 10000,
            });
            beep();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "security_findings" },
        () => refresh(),
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "security_findings" },
        () => refresh(),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const unackHighCount = useMemo(
    () => findings.filter((f) =>
      f.status === "open" &&
      (f.severity === "high" || f.severity === "critical") &&
      !(f.acknowledged_by ?? []).includes(user?.id ?? ""),
    ).length,
    [findings, user?.id],
  );

  const acknowledge = async (id: string) => {
    if (!user) return;
    const target = findings.find((f) => f.id === id);
    if (!target) return;
    const next = Array.from(new Set([...(target.acknowledged_by ?? []), user.id]));
    // Optimistic update so the unread badge clears immediately
    setFindings((list) => list.map((f) => (f.id === id ? { ...f, acknowledged_by: next } : f)));
    const { error } = await supabase
      .from("security_findings" as any)
      .update({ acknowledged_by: next as any })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      await refresh(); // revert on failure
      return;
    }
  };

  const resolve = async (id: string) => {
    const { error } = await supabase
      .from("security_findings" as any)
      .update({ status: "resolved" as any })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked resolved");
    await refresh();
  };

  return (
    <C.Provider value={{ findings, unackHighCount, isAdmin, refresh, acknowledge, resolve }}>
      {children}
    </C.Provider>
  );
}

export function useSecurityAlerts() {
  return useContext(C);
}
