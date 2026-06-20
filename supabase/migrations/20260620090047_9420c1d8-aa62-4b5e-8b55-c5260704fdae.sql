
-- 1. Fix function search_path mutability
CREATE OR REPLACE FUNCTION public.derive_campaign_status(_start date, _end date, _current campaign_status)
RETURNS campaign_status
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN _current IN ('paused','cancelled') THEN _current
    WHEN _start IS NULL OR _end IS NULL THEN COALESCE(_current,'draft'::public.campaign_status)
    WHEN current_date < _start THEN 'draft'::public.campaign_status
    WHEN current_date > _end THEN 'completed'::public.campaign_status
    ELSE 'active'::public.campaign_status
  END
$function$;

-- 2. Enforce workspace on campaigns
ALTER TABLE public.campaigns ALTER COLUMN workspace_id SET NOT NULL;
DROP POLICY IF EXISTS campaigns_insert ON public.campaigns;
CREATE POLICY campaigns_insert ON public.campaigns
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id AND workspace_id IS NOT NULL AND public.can_edit_workspace(workspace_id, auth.uid()));

-- 3. Lock down security_findings: explicit deny for client INSERT/DELETE (no policies = deny for authenticated). Already true, but make it explicit + ensure service_role can write.
REVOKE INSERT, DELETE ON public.security_findings FROM authenticated, anon;
GRANT ALL ON public.security_findings TO service_role;

-- 4. Remove security_findings from realtime publication to prevent broadcast leakage
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'security_findings'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.security_findings';
  END IF;
END $$;

-- 5. Allow workspace members to read campaign-files linked to reports they can access
DROP POLICY IF EXISTS "campaign files select workspace members" ON storage.objects;
CREATE POLICY "campaign files select workspace members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'campaign-files'
    AND EXISTS (
      SELECT 1
      FROM public.report_attachments ra
      JOIN public.reports r ON r.id = ra.report_id
      JOIN public.campaigns c ON c.id = r.campaign_id
      WHERE ra.file_path = storage.objects.name
        AND public.is_workspace_member(c.workspace_id, auth.uid())
    )
  );
