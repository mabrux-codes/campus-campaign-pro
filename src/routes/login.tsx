import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLockup } from "@/components/brand";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) navigate({ to: "/dashboard" });
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  };

  const signInOAuth = async (provider: "google" | "apple") => {
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) toast.error((result.error as any).message ?? `${provider} sign-in failed`);
  };

  return (
    <AuthShell>
      <div className="space-y-1">
        <h1 className="font-display text-3xl">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to continue to your workspace.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={() => signInOAuth("google")}>
          <GoogleIcon className="mr-2 h-4 w-4" /> Google
        </Button>
        <Button type="button" variant="outline" onClick={() => signInOAuth("apple")}>
          <AppleIcon className="mr-2 h-4 w-4" /> Apple
        </Button>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">or</span></div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
              Forgot?
            </Link>
          </div>
          <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in
        </Button>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        New to Lumen?{" "}
        <Link to="/signup" className="font-medium text-foreground hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.9 0 3.16.8 3.88 1.5l2.65-2.55C16.9 3.4 14.7 2.4 12 2.4 6.96 2.4 2.9 6.46 2.9 11.5S6.96 20.6 12 20.6c6.93 0 9.2-4.86 9.2-7.4 0-.5-.05-.88-.13-1.25H12z"/>
    </svg>
  );
}

export function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.43 2.23-1.18 3.03-.79.86-2.09 1.52-3.16 1.43-.13-1.1.41-2.24 1.13-2.97.8-.83 2.18-1.45 3.21-1.49zM20.5 17.27c-.55 1.27-.82 1.84-1.53 2.97-.99 1.58-2.39 3.55-4.12 3.56-1.54.02-1.94-.99-4.03-.97-2.09.01-2.52 1-4.06.97-1.73-.03-3.06-1.8-4.05-3.38C.04 16.06-.27 10.7 1.5 8.06c1.26-1.86 3.24-2.95 5.09-2.95 1.89 0 3.07 1.03 4.63 1.03 1.51 0 2.43-1.04 4.61-1.04 1.65 0 3.39.9 4.64 2.45-4.08 2.24-3.42 8.07.03 9.72z"/>
    </svg>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="hidden flex-1 flex-col justify-between border-r border-border bg-muted/30 p-12 lg:flex">
        <BrandLockup />
        <div className="space-y-4">
          <p className="font-display text-4xl leading-tight">
            The calm home for university marketing campaigns.
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            Plan paid, organic and influencer work in one place. Capture results the day a campaign ends — never chase a spreadsheet again.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">© Lumen</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden">
            <BrandLockup />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
