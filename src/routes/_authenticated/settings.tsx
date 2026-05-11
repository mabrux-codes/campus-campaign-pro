import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/lib/theme";
import { CURRENCIES, useCurrency, formatMoney } from "@/lib/currency";
import { useWorkspace } from "@/lib/workspace";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Moon, Sun, Building2, User, CreditCard, ShieldCheck, LogOut } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { currency, setCurrency } = useCurrency();
  const { current, workspaces } = useWorkspace();
  const { user, signOut } = useAuth();

  const sendReset = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Workspace, appearance, currency, and account.</p>
      </div>

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
