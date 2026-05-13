
-- Add foreign keys with cascade for campaign-related data
ALTER TABLE public.influencers
  DROP CONSTRAINT IF EXISTS influencers_campaign_id_fkey,
  ADD CONSTRAINT influencers_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_campaign_id_fkey,
  ADD CONSTRAINT reports_campaign_id_fkey
    FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;

ALTER TABLE public.report_attachments
  DROP CONSTRAINT IF EXISTS report_attachments_report_id_fkey,
  ADD CONSTRAINT report_attachments_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE;

-- Workspace cascades
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_workspace_id_fkey,
  ADD CONSTRAINT workspace_members_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_workspace_id_fkey,
  ADD CONSTRAINT workspace_invitations_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.deliverables_catalog
  DROP CONSTRAINT IF EXISTS deliverables_catalog_workspace_id_fkey,
  ADD CONSTRAINT deliverables_catalog_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

ALTER TABLE public.influencer_profiles
  DROP CONSTRAINT IF EXISTS influencer_profiles_workspace_id_fkey,
  ADD CONSTRAINT influencer_profiles_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Lookup invitation by token (security definer; safe public read of minimal fields)
CREATE OR REPLACE FUNCTION public.lookup_invitation(_token text)
RETURNS TABLE(id uuid, email text, role workspace_role, workspace_id uuid, workspace_name text, accepted_at timestamptz, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role, i.workspace_id, w.name, i.accepted_at, i.expires_at
  FROM public.workspace_invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token;
$$;

-- Accept invitation: adds the current user to the workspace and marks accepted
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv RECORD;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO inv FROM public.workspace_invitations WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already accepted'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (inv.workspace_id, uid, inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations SET accepted_at = now() WHERE id = inv.id;
  RETURN inv.workspace_id;
END $$;

-- Ensure unique constraint exists for the on-conflict above
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspace_members_workspace_user_unique'
  ) THEN
    ALTER TABLE public.workspace_members
      ADD CONSTRAINT workspace_members_workspace_user_unique UNIQUE (workspace_id, user_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.lookup_invitation(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
