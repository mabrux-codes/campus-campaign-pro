import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { useCurrency, CURRENCIES, type Currency } from "@/lib/currency";
import { CountryPicker } from "@/components/country-picker";
import { DeliverablesPicker } from "@/components/deliverables-picker";
import { SOCIAL_PLATFORMS, handlePlaceholder } from "@/lib/social-platforms";
import { getRates, convert } from "@/lib/fx";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowLeft, ArrowRight, RefreshCw, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  component: NewCampaign,
});

const AD_PLATFORMS = ["Meta Ads", "TikTok Ads", "Google Ads", "LinkedIn Ads", "X/Twitter Ads"];

type Influencer = {
  profile_id?: string | null;
  name: string;
  platform: string;
  handle: string;
  followers: string;
};

function NewCampaign() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { current } = useWorkspace();
  const { currency, setCurrency, symbol } = useCurrency();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    university_name: "",
    client_country: "",
    contact_person: "",
    contact_email: "",
    contact_phone: "",
    name: "",
    description: "",
    objectives: "",
    deliverables: "",
    start_date: "",
    end_date: "",
    type: "organic" as "paid" | "organic",
    paid_budget: "",
    platforms: [] as string[],
    uses_influencers: false,
  });
  const [influencers, setInfluencers] = useState<Influencer[]>([]);

  const upd = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const togglePlatform = (p: string) =>
    upd("platforms", form.platforms.includes(p) ? form.platforms.filter((x) => x !== p) : [...form.platforms, p]);

  const submit = async () => {
    if (!user) return;
    if (!form.name || !form.university_name) {
      toast.error("Campaign name and client name are required.");
      setStep(1);
      return;
    }
    setBusy(true);
    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        owner_id: user.id,
        workspace_id: current?.id ?? null,
        university_name: form.university_name,
        client_country: form.client_country || null,
        contact_person: form.contact_person || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        name: form.name,
        description: form.description || null,
        objectives: form.objectives || null,
        deliverables: form.deliverables || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        type: form.type,
        paid_budget: form.paid_budget ? Number(form.paid_budget) : null,
        budget_currency: form.paid_budget ? currency : null,
        platforms: form.type === "paid" ? form.platforms : [],
        uses_influencers: form.type === "paid" && form.uses_influencers,
      })
      .select("id")
      .single();

    if (error || !campaign) {
      setBusy(false);
      toast.error(error?.message ?? "Failed to create campaign");
      return;
    }

    if (form.type === "paid" && form.uses_influencers && influencers.length > 0) {
      const rows = influencers
        .filter((i) => i.name)
        .map((i) => ({
          campaign_id: campaign.id,
          profile_id: i.profile_id ?? null,
          name: i.name,
          handle: i.handle || null,
          platform: i.platform || null,
          followers: i.followers ? Number(i.followers) : null,
        }));
      if (rows.length) await supabase.from("influencers").insert(rows);
    }

    setBusy(false);
    toast.success("Campaign created");
    navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  };

  const totalSteps = form.type === "paid" ? 4 : 3;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Step {step} of {totalSteps}</p>
          <h1 className="font-display text-4xl">New campaign</h1>
        </div>
      </div>

      <div className="flex gap-1">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Client</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="University / Client name *" value={form.university_name} onChange={(v) => upd("university_name", v)} />
            <div className="space-y-2">
              <Label>Country</Label>
              <CountryPicker value={form.client_country} onChange={(v) => upd("client_country", v)} />
            </div>
            <Field label="Contact person" value={form.contact_person} onChange={(v) => upd("contact_person", v)} />
            <Field label="Contact email" type="email" value={form.contact_email} onChange={(v) => upd("contact_email", v)} />
            <Field label="Contact phone" value={form.contact_phone} onChange={(v) => upd("contact_phone", v)} />
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Campaign details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Campaign name *" value={form.name} onChange={(v) => upd("name", v)} />
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => upd("description", e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Objectives</Label>
              <Textarea value={form.objectives} onChange={(e) => upd("objectives", e.target.value)} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Deliverables</Label>
              <DeliverablesPicker value={form.deliverables} onChange={(v) => upd("deliverables", v)} />
              <p className="text-xs text-muted-foreground">Pick from your library or add new ones — they're saved for next time.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" type="date" value={form.start_date} onChange={(v) => upd("start_date", v)} />
              <Field label="End date" type="date" value={form.end_date} onChange={(v) => upd("end_date", v)} />
            </div>
            <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Status updates automatically based on the campaign window — Draft before start, Active during, Completed after end.
            </p>
            {form.start_date && form.end_date && (
              <p className="text-xs text-muted-foreground">
                Duration: {Math.max(0, Math.ceil((+new Date(form.end_date) - +new Date(form.start_date)) / 86400000))} days
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base font-medium">Type</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(["organic", "paid"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => upd("type", t)}
                  className={`rounded-lg border p-4 text-left transition ${
                    form.type === t ? "border-primary bg-accent/40" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <p className="font-medium capitalize">{t} campaign</p>
                  <p className="text-xs text-muted-foreground">
                    {t === "organic" ? "Owned channels, no media spend." : "Paid media spend across ad platforms."}
                  </p>
                </button>
              ))}
            </div>

            <div className="space-y-4 border-t border-border pt-4">
              <BudgetSection
                amount={form.paid_budget}
                onAmount={(v) => upd("paid_budget", v)}
                currency={currency}
                setCurrency={setCurrency}
                symbol={symbol}
              />

              {form.type === "paid" && (
                <>
                  <div className="space-y-2">
                    <Label>Platforms</Label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {AD_PLATFORMS.map((p) => (
                        <label key={p} className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm">
                          <Checkbox checked={form.platforms.includes(p)} onCheckedChange={() => togglePlatform(p)} />
                          {p}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border p-3">
                    <div>
                      <p className="text-sm font-medium">Use influencers?</p>
                      <p className="text-xs text-muted-foreground">Add creators in the next step.</p>
                    </div>
                    <Switch checked={form.uses_influencers} onCheckedChange={(v) => upd("uses_influencers", v)} />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && form.type === "paid" && (
        <InfluencerStep
          uses={form.uses_influencers}
          influencers={influencers}
          setInfluencers={setInfluencers}
        />
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        {step < totalSteps ? (
          <Button onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create campaign
          </Button>
        )}
      </div>
    </div>
  );
}

function BudgetSection({ amount, onAmount, currency, setCurrency, symbol }: {
  amount: string; onAmount: (v: string) => void;
  currency: Currency; setCurrency: (c: Currency) => Promise<void>; symbol: string;
}) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const loadRates = async (force = false) => {
    setLoading(true);
    if (force) try { localStorage.removeItem("fx_rates_v1"); } catch {}
    const r = await getRates();
    if (r) { setRates(r.rates); setUpdated(r.updated); }
    setLoading(false);
  };
  useEffect(() => { loadRates(); }, []);

  const num = Number(amount);
  const kes = rates && !isNaN(num) && num > 0 ? convert(num, currency, "KES", rates) : null;

  return (
    <div className="space-y-2">
      <Label>Marketing amount needed</Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{symbol.trim() || currency}</span>
          <Input type="number" value={amount} onChange={(e) => onAmount(e.target.value)} className="pl-10" placeholder="0" />
        </div>
        <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <div>
          <span className="text-muted-foreground">≈ </span>
          <span className="font-medium">
            {kes !== null
              ? `KSh ${kes.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
              : currency === "KES"
                ? "—"
                : "Loading rate…"}
          </span>
          {currency !== "KES" && <span className="ml-2 text-muted-foreground">(live FX)</span>}
        </div>
        <button type="button" onClick={() => loadRates(true)} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {updated ? `Updated ${new Date(updated).toLocaleTimeString()}` : "Refresh"}
        </button>
      </div>
    </div>
  );
}

function InfluencerStep({ uses, influencers, setInfluencers }: {
  uses: boolean;
  influencers: Influencer[];
  setInfluencers: (v: Influencer[] | ((p: Influencer[]) => Influencer[])) => void;
}) {
  const { current } = useWorkspace();
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [creatingNew, setCreatingNew] = useState(false);
  const [draft, setDraft] = useState<Influencer>({ name: "", platform: "", handle: "", followers: "" });

  const load = async () => {
    if (!current?.id) return;
    const { data } = await supabase
      .from("influencer_profiles")
      .select("id,name,platform,handle,followers,avatar_url")
      .eq("workspace_id", current.id)
      .order("name");
    setProfiles(data ?? []);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [current?.id]);

  const filtered = profiles.filter((p) =>
    !search ||
    `${p.name} ${p.handle ?? ""} ${p.platform ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  const isPicked = (id: string) => influencers.some((i) => i.profile_id === id);
  const pick = (p: any) => {
    if (isPicked(p.id)) {
      setInfluencers((arr) => arr.filter((i) => i.profile_id !== p.id));
    } else {
      setInfluencers((arr) => [...arr, {
        profile_id: p.id, name: p.name, platform: p.platform ?? "", handle: p.handle ?? "", followers: p.followers?.toString() ?? "",
      }]);
    }
  };

  const saveNew = async () => {
    if (!draft.name.trim() || !current?.id) return toast.error("Name is required");
    if (!draft.platform) return toast.error("Pick a platform");
    const { data, error } = await supabase
      .from("influencer_profiles")
      .insert({
        workspace_id: current.id,
        name: draft.name.trim(),
        platform: draft.platform,
        handle: draft.handle || null,
        followers: draft.followers ? Number(draft.followers) : null,
      })
      .select("id,name,platform,handle,followers")
      .single();
    if (error || !data) return toast.error(error?.message ?? "Failed");
    toast.success("Saved to your library");
    setInfluencers((arr) => [...arr, {
      profile_id: data.id, name: data.name, platform: data.platform ?? "", handle: data.handle ?? "", followers: data.followers?.toString() ?? "",
    }]);
    setDraft({ name: "", platform: "", handle: "", followers: "" });
    setCreatingNew(false);
    load();
  };

  if (!uses) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Influencers</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No influencers selected for this campaign.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base font-medium">
          Influencers
          <Button size="sm" variant="outline" onClick={() => setCreatingNew((v) => !v)}>
            <Plus className="mr-2 h-4 w-4" /> New influencer
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {creatingNew && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Add to your library</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
              <div className="space-y-2">
                <Label>Platform *</Label>
                <Select value={draft.platform} onValueChange={(v) => setDraft({ ...draft, platform: v })}>
                  <SelectTrigger><SelectValue placeholder="Select platform" /></SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {draft.platform && (
                <Field label="Handle / URL" value={draft.handle} onChange={(v) => setDraft({ ...draft, handle: v })} placeholder={handlePlaceholder(draft.platform)} />
              )}
              <Field label="Followers" type="number" value={draft.followers} onChange={(v) => setDraft({ ...draft, followers: v })} />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCreatingNew(false)}>Cancel</Button>
              <Button size="sm" onClick={saveNew}>Save</Button>
            </div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search your influencer library" className="pl-9" />
        </div>

        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No influencers in your library yet — add your first one above.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtered.map((p) => {
              const picked = isPicked(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={`flex items-start justify-between gap-2 rounded-lg border p-3 text-left transition ${
                    picked ? "border-primary bg-accent/40" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.handle ?? "—"}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.platform && <Badge variant="outline" className="text-[10px]">{p.platform}</Badge>}
                      {p.followers != null && <Badge variant="outline" className="text-[10px]">{p.followers.toLocaleString()} followers</Badge>}
                    </div>
                  </div>
                  <div className={`mt-0.5 h-4 w-4 shrink-0 rounded border ${picked ? "border-primary bg-primary" : "border-border"}`} />
                </button>
              );
            })}
          </div>
        )}

        {influencers.length > 0 && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Selected for this campaign</p>
            {influencers.map((inf, idx) => (
              <div key={idx} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  {inf.name} <span className="text-xs text-muted-foreground">{inf.platform}{inf.handle ? ` · ${inf.handle}` : ""}</span>
                </span>
                <Button size="icon" variant="ghost" onClick={() => setInfluencers((a) => a.filter((_, i) => i !== idx))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
