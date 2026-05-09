import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Workspace = { id: string; name: string; owner_id: string; role: string };
type Ctx = {
  workspaces: Workspace[];
  current: Workspace | null;
  setCurrent: (id: string) => void;
  refresh: () => Promise<void>;
  loading: boolean;
};

const C = createContext<Ctx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("workspace_members")
      .select("role,workspace:workspaces(id,name,owner_id)")
      .eq("user_id", user.id);
    const list: Workspace[] = (data ?? [])
      .map((r: any) => r.workspace ? { ...r.workspace, role: r.role } : null)
      .filter(Boolean);
    setWorkspaces(list);
    if (list.length > 0) {
      const stored = typeof window !== "undefined" ? localStorage.getItem("ws.current") : null;
      const found = list.find((w) => w.id === stored);
      setCurrentId(found?.id ?? list[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      setLoading(true);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setCurrent = (id: string) => {
    setCurrentId(id);
    if (typeof window !== "undefined") localStorage.setItem("ws.current", id);
  };

  const current = workspaces.find((w) => w.id === currentId) ?? null;

  return <C.Provider value={{ workspaces, current, setCurrent, refresh, loading }}>{children}</C.Provider>;
}

export function useWorkspace() {
  const c = useContext(C);
  if (!c) throw new Error("useWorkspace must be inside WorkspaceProvider");
  return c;
}
