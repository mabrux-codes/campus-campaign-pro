import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/invite/$token")({
  component: AcceptInvite,
});

function AcceptInvite() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const { refresh: refreshWorkspaces, setCurrent } = useWorkspace();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("lookup_invitation", { _token: token });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) return setErr("Invitation not found.");
      if (row.accepted_at) return setErr("This invitation has already been accepted.");
      if (new Date(row.expires_at) < new Date()) return setErr("This invitation has expired.");
      setInvite({
        id: row.id,
        email: row.email,
        role: row.role,
        workspace_id: row.workspace_id,
        workspace: { name: row.workspace_name },
      });
    })();
  }, [token]);

  const accept = async () => {
    if (!user || !invite) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    if (error) {
      setBusy(false);
      return toast.error(error.message);
    }
    const wsId = (data as string) ?? invite.workspace_id;
    if (typeof window !== "undefined") localStorage.setItem("ws.current", wsId);
    toast.success("Welcome to the team!");
    navigate({ to: "/dashboard" });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader><CardTitle>Sign in to accept</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">You need an account to accept this invitation.</p>
            <Button onClick={() => navigate({ to: "/login" })}>Sign in</Button>
            <Button variant="outline" onClick={() => navigate({ to: "/signup" })}>Create account</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader><CardTitle>Workspace invitation</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {err ? (
            <p className="text-sm text-destructive">{err}</p>
          ) : !invite ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <p className="text-sm">
                You've been invited to join <strong>{invite.workspace?.name}</strong> as <strong>{invite.role}</strong>.
              </p>
              <Button onClick={accept} disabled={busy} className="w-full">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Accept invitation
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
