import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/lib/workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/team")({
  component: TeamPage,
});

const emailSchema = z.string().trim().email().max(255);

function TeamPage() {
  const { current } = useWorkspace();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "viewer">("editor");

  const { data: members = [] } = useQuery({
    queryKey: ["members", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_members")
        .select("id,role,user_id,profile:profiles(full_name,email,avatar_url)")
        .eq("workspace_id", current!.id);
      return data ?? [];
    },
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["invites", current?.id],
    enabled: !!current,
    queryFn: async () => {
      const { data } = await supabase
        .from("workspace_invitations")
        .select("id,email,role,token,expires_at,accepted_at,created_at")
        .eq("workspace_id", current!.id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const isAdmin = current?.role === "owner" || current?.role === "admin";

  const invite = async () => {
    if (!current) return;
    const parse = emailSchema.safeParse(email);
    if (!parse.success) return toast.error("Enter a valid email.");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("workspace_invitations").insert({
      workspace_id: current.id,
      email: parse.data.toLowerCase(),
      role,
      invited_by: user.id,
    });
    if (error) return toast.error(error.message);
    setEmail("");
    qc.invalidateQueries({ queryKey: ["invites", current.id] });
    toast.success("Invitation created — share the link below.");
  };

  const cancelInvite = async (id: string) => {
    await supabase.from("workspace_invitations").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["invites", current?.id] });
  };

  const updateRole = async (memberId: string, r: string) => {
    const { error } = await supabase.from("workspace_members").update({ role: r as any }).eq("id", memberId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["members", current?.id] });
    toast.success("Role updated");
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("Remove this member?")) return;
    const { error } = await supabase.from("workspace_members").delete().eq("id", memberId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["members", current?.id] });
  };

  const copy = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  if (!current) return <p className="text-sm text-muted-foreground">Pick a workspace first.</p>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Team</h1>
        <p className="text-sm text-muted-foreground">Manage members and roles for {current.name}.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Invite a teammate</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[200px] space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as any)}>
                  <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={invite}><UserPlus className="mr-2 h-4 w-4" />Invite</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Members ({members.length})</CardTitle></CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {members.map((m: any) => (
              <li key={m.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{m.profile?.full_name || m.profile?.email || m.user_id}</p>
                  <p className="text-xs text-muted-foreground">{m.profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && m.role !== "owner" ? (
                    <Select value={m.role} onValueChange={(v) => updateRole(m.id, v)}>
                      <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline" className="capitalize">{m.role}</Badge>
                  )}
                  {isAdmin && m.role !== "owner" && (
                    <Button variant="ghost" size="icon" onClick={() => removeMember(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {isAdmin && invites.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Pending invitations</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {invites.map((inv: any) => (
                <li key={inv.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">Role: {inv.role}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => copy(inv.token)}>
                      <Copy className="mr-2 h-3.5 w-3.5" /> Copy link
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => cancelInvite(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
