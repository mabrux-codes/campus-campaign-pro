import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  const navigate = useNavigate();
  const [invite, setInvite] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("workspace_invitations")
        .select("id,email,role,workspace_id,accepted_at,expires_at,workspace:workspaces(name)")
        .eq("token", token)
        .maybeSingle();
      if (error || !data) return setErr("Invitation not found.");
      if (data.accepted_at) return setErr("This invitation has already been accepted.");
      if (new Date(data.expires_at) < new Date()) return setErr("This invitation has expired.");
      setInvite(data);
    })();
  }, [token]);

  const accept = async () => {
    if (!user || !invite) return;
    setBusy(true);
    const { error } = await supabase.from("workspace_members").insert({
      workspace_id: invite.workspace_id,
      user_id: user.id,
      role: invite.role,
    });
    if (error && !error.message.includes("duplicate")) {
      setBusy(false);
      return toast.error(error.message);
    }
    await supabase.from("workspace_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    if (typeof window !== "undefined") localStorage.setItem("ws.current", invite.workspace_id);
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
