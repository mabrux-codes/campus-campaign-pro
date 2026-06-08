import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    company_name: "",
    country: "",
    bio: "",
    twitter: "",
    linkedin: "",
    instagram: "",
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      const sl = (profile.social_links as any) ?? {};
      setForm({
        full_name: profile.full_name ?? "",
        phone: profile.phone ?? "",
        company_name: profile.company_name ?? "",
        country: profile.country ?? "",
        bio: profile.bio ?? "",
        twitter: sl.twitter ?? "",
        linkedin: sl.linkedin ?? "",
        instagram: sl.instagram ?? "",
      });
    }
  }, [profile]);

  const upload = async (bucket: "avatars" | "company-logos", file: File, field: "avatar_url" | "company_logo_url") => {
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const update = field === "avatar_url" ? { avatar_url: data.publicUrl } : { company_logo_url: data.publicUrl };
    await supabase.from("profiles").update(update).eq("id", user.id);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    toast.success("Image updated");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name,
        phone: form.phone,
        company_name: form.company_name,
        country: form.country,
        bio: form.bio,
        social_links: { twitter: form.twitter, linkedin: form.linkedin, instagram: form.instagram },
      })
      .eq("id", user.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
    toast.success("Profile saved");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-4xl">Profile</h1>
        <p className="text-sm text-muted-foreground">How you appear in Lumen.</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Photos</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-center gap-6">
          <div className="space-y-2">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback>{form.full_name?.[0]?.toUpperCase() ?? "U"}</AvatarFallback>
            </Avatar>
            <FileButton label="Profile photo" onChoose={(f) => upload("avatars", f, "avatar_url")} />
          </div>
          <div className="space-y-2">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
              {profile?.company_logo_url ? (
                <img src={profile.company_logo_url} alt="logo" className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-muted-foreground">No logo</span>
              )}
            </div>
            <FileButton label="Company logo" onChoose={(f) => upload("company-logos", f, "company_logo_url")} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-medium">Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} disabled />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <PhoneInput
                international
                defaultCountry="US"
                value={form.phone || undefined}
                onChange={(v) => setForm({ ...form, phone: (v as string) ?? "" })}
                className="phone-input flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value="Digital Marketer" disabled />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Bio</Label>
              <Textarea rows={3} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>LinkedIn</Label>
              <Input value={form.linkedin} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>X / Twitter</Label>
              <Input value={form.twitter} onChange={(e) => setForm({ ...form, twitter: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Instagram</Label>
              <Input value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function FileButton({ label, onChoose }: { label: string; onChoose: (f: File) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs hover:bg-muted">
      <Upload className="h-3 w-3" />
      {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onChoose(f);
        }}
      />
    </label>
  );
}
