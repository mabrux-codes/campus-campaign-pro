
-- Deliverables catalog
CREATE TABLE public.deliverables_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, label)
);
ALTER TABLE public.deliverables_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY dc_select ON public.deliverables_catalog FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY dc_insert ON public.deliverables_catalog FOR INSERT WITH CHECK (public.can_edit_workspace(workspace_id, auth.uid()));
CREATE POLICY dc_update ON public.deliverables_catalog FOR UPDATE USING (public.can_edit_workspace(workspace_id, auth.uid()));
CREATE POLICY dc_delete ON public.deliverables_catalog FOR DELETE USING (public.can_edit_workspace(workspace_id, auth.uid()));

-- Influencer profiles (master directory)
CREATE TABLE public.influencer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  platform text,
  handle text,
  followers integer,
  avatar_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.influencer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY ip_select ON public.influencer_profiles FOR SELECT USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY ip_insert ON public.influencer_profiles FOR INSERT WITH CHECK (public.can_edit_workspace(workspace_id, auth.uid()));
CREATE POLICY ip_update ON public.influencer_profiles FOR UPDATE USING (public.can_edit_workspace(workspace_id, auth.uid()));
CREATE POLICY ip_delete ON public.influencer_profiles FOR DELETE USING (public.can_edit_workspace(workspace_id, auth.uid()));
CREATE TRIGGER trg_ip_touch BEFORE UPDATE ON public.influencer_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Link campaign influencers to a profile (optional)
ALTER TABLE public.influencers ADD COLUMN IF NOT EXISTS profile_id uuid;
CREATE INDEX IF NOT EXISTS idx_influencers_profile ON public.influencers(profile_id);
