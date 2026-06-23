import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTheme } from "@/lib/theme";
import { CURRENCIES, useCurrency, formatMoney } from "@/lib/currency";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { useSecurityAlerts } from "@/lib/security-alerts";
import { useUiPref } from "@/lib/ui-prefs";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { deleteMyAccount } from "@/lib/account.functions";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Moon, Sun, Building2, User, CreditCard, ShieldCheck, LogOut, ShieldAlert, Check, Link2, LayoutGrid, AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

type IdentityProvider = "google" | "apple";

function SettingsPage() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { current, workspaces } = useWorkspace();
  const { user, signOut } = useAuth();
  const { findings, isAdmin, acknowledge, resolve } = useSecurityAlerts();
  const [identities, setIdentities] = useState<string[]>([]);
  const [influencerView, setInfluencerView] = useUiPref<"grid" | "list">("influencers.view", "grid");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const deleteAccountFn = useServerFn(deleteMyAccount);
  const DELETE_PHRASE = "i want to proceed deleting my account";

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const ids = (data.user?.identities ?? []).map((i) => i.provider);
      setIdentities(ids);
    });
    return () => { active = false; };
  }, [user?.id]);

  const sendReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  const linkProvider = async (provider: IdentityProvider) => {
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin + "/settings",
    });
    if (result.error) toast.error((result.error as any).message ?? `Could not start ${provider} sign-in`);
  };

  const [severityFilter, setSeverityFilter] = useState<"all" | "low" | "medium" | "high" | "critical">("all");
  const openFindings = findings.filter((f) => f.status === "open");
  const visibleFindings = severityFilter === "all" ? findings : findings.filter((f) => f.severity === severityFilter);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace, appearance, currency, security, and account.</p>
      </div>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <ShieldAlert className="h-4 w-4 text-destructive" /> Security findings
              {openFindings.length > 0 && (
                <Badge variant="destructive" className="ml-2">{openFindings.length} open</Badge>
              )}
            </CardTitle>
            <CardDescription>Live alerts from connector and workspace scans. Visible to admins only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Severity</Label>
              <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as any)}>
                <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {visibleFindings.length === 0 ? (
              <p className="text-sm text-muted-foreground">{findings.length === 0 ? "No findings yet. You'll be notified live when one appears." : "No findings match this severity."}</p>
            ) : (
              <ul className="space-y-2">
                {visibleFindings.slice(0, 12).map((f) => {
                  const acked = (f.acknowledged_by ?? []).includes(user?.id ?? "");
                  return (
                    <li key={f.id} className="flex items-start gap-3 rounded-md border border-border p-3 text-sm">
                      <div className="mt-0.5">
                        <SeverityBadge severity={f.severity} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{f.title}</p>
                          <Badge variant="outline" className="text-[10px] uppercase">{f.source}</Badge>
                          <Badge variant="outline" className="text-[10px] uppercase">{f.status}</Badge>
                          {acked && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><Check className="h-3 w-3" /> Acknowledged</span>}
                        </div>
                        {f.description && <p className="mt-1 text-xs text-muted-foreground">{f.description}</p>}
                        <div className="mt-2 flex gap-2">
                          {!acked && f.status === "open" && (
                            <Button size="sm" variant="outline" onClick={() => acknowledge(f.id)}>Acknowledge</Button>
                          )}
                          {f.status === "open" && (
                            <Button size="sm" variant="ghost" onClick={() => resolve(f.id)}>Mark resolved</Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium"><Link2 className="h-4 w-4" /> Connected accounts</CardTitle>
          <CardDescription>Link your social accounts for faster sign-in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProviderRow
            name="Google"
            connected={identities.includes("google")}
            onLink={() => linkProvider("google")}
          />
          <ProviderRow
            name="Apple"
            connected={identities.includes("apple")}
            onLink={() => linkProvider("apple")}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium"><CreditCard className="h-4 w-4" /> Currency</CardTitle>
          <CardDescription>Used everywhere amounts are shown — budgets, costs, exports.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Display currency</Label>
            <Select value={currency} onValueChange={(v) => { setCurrency(v as any); toast.success(`Currency set to ${v}`); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">{formatMoney(12500, currency)}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            {theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} Appearance
          </CardTitle>
          <CardDescription>Choose your theme. System matches your OS.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(["light", "dark"] as const).map((t) => (
              <Button key={t} variant={theme === t ? "default" : "outline"} size="sm" onClick={() => setTheme(t)} className="capitalize">
                {t}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium"><Building2 className="h-4 w-4" /> Workspace</CardTitle>
          <CardDescription>Active workspace and team management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">Active workspace</span><span className="font-medium">{current?.name ?? "—"}</span></div>
          <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">Your role</span><span className="font-medium capitalize">{current?.role ?? "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total workspaces</span><span className="font-medium">{workspaces.length}</span></div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild size="sm" variant="outline"><Link to="/team">Manage team</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/profile">Edit profile</Link></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium"><User className="h-4 w-4" /> Account</CardTitle>
          <CardDescription>Email, password, and session.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-border pb-2"><span className="text-muted-foreground">Email</span><span className="font-medium">{user?.email}</span></div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={sendReset}><ShieldCheck className="mr-2 h-3.5 w-3.5" /> Send password reset</Button>
            <Button size="sm" variant="outline" onClick={() => signOut()}><LogOut className="mr-2 h-3.5 w-3.5" /> Sign out</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProviderRow({ name, connected, onLink, note }: { name: string; connected: boolean; onLink: () => void; note?: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium">{name}</p>
        {note && !connected && <p className="text-xs text-muted-foreground">{note}</p>}
      </div>
      {connected ? (
        <Badge variant="outline" className="gap-1"><Check className="h-3 w-3" /> Connected</Badge>
      ) : (
        <Button size="sm" variant="outline" onClick={onLink} disabled={!!note}>Connect</Button>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-warning/20 text-warning-foreground border border-warning/40",
    high: "bg-destructive/20 text-destructive border border-destructive/40",
    critical: "bg-destructive text-destructive-foreground",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${map[severity] ?? map.low}`}>{severity}</span>;
}
