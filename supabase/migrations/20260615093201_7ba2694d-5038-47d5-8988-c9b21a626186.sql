
-- Severity enum
DO $$ BEGIN
  CREATE TYPE public.security_severity AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.security_finding_status AS ENUM ('open','resolved','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. security_findings
CREATE TABLE public.security_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  severity public.security_severity NOT NULL DEFAULT 'medium',
  title text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual',
  status public.security_finding_status NOT NULL DEFAULT 'open',
  acknowledged_by uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.security_findings TO authenticated;
GRANT ALL ON public.security_findings TO service_role;

ALTER TABLE public.security_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY sf_select ON public.security_findings
  FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.can_admin_workspace(workspace_id, auth.uid()));

CREATE POLICY sf_update ON public.security_findings
  FOR UPDATE TO authenticated
  USING (workspace_id IS NOT NULL AND public.can_admin_workspace(workspace_id, auth.uid()))
  WITH CHECK (workspace_id IS NOT NULL AND public.can_admin_workspace(workspace_id, auth.uid()));

CREATE TRIGGER trg_sf_touch BEFORE UPDATE ON public.security_findings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.security_findings;
ALTER TABLE public.security_findings REPLICA IDENTITY FULL;

-- 2. campaign_influencers
CREATE TABLE public.campaign_influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  influencer_profile_id uuid NOT NULL REFERENCES public.influencer_profiles(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, influencer_profile_id)
);

CREATE INDEX idx_ci_workspace ON public.campaign_influencers(workspace_id);
CREATE INDEX idx_ci_campaign ON public.campaign_influencers(campaign_id);
CREATE INDEX idx_ci_profile ON public.campaign_influencers(influencer_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_influencers TO authenticated;
GRANT ALL ON public.campaign_influencers TO service_role;

ALTER TABLE public.campaign_influencers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ci_select ON public.campaign_influencers
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY ci_insert ON public.campaign_influencers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_workspace(workspace_id, auth.uid()));

CREATE POLICY ci_update ON public.campaign_influencers
  FOR UPDATE TO authenticated
  USING (public.can_edit_workspace(workspace_id, auth.uid()))
  WITH CHECK (public.can_edit_workspace(workspace_id, auth.uid()));

CREATE POLICY ci_delete ON public.campaign_influencers
  FOR DELETE TO authenticated
  USING (public.can_edit_workspace(workspace_id, auth.uid()));
