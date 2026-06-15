
-- 1. Fix workspace_members INSERT policy (remove self-join branch)
DROP POLICY IF EXISTS wm_insert ON public.workspace_members;
CREATE POLICY wm_insert ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_admin_workspace(workspace_id, auth.uid()));

-- 2. accept_invitation: verify caller's email matches the invitation
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv RECORD;
  uid uuid := auth.uid();
  uemail text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  SELECT * INTO inv FROM public.workspace_invitations WHERE token = _token;
  IF inv IS NULL THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF inv.accepted_at IS NOT NULL THEN RAISE EXCEPTION 'Invitation already accepted'; END IF;
  IF inv.expires_at < now() THEN RAISE EXCEPTION 'Invitation expired'; END IF;
  IF lower(coalesce(uemail,'')) <> lower(inv.email) THEN
    RAISE EXCEPTION 'This invitation is not for your account';
  END IF;

  INSERT INTO public.workspace_members(workspace_id, user_id, role)
  VALUES (inv.workspace_id, uid, inv.role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.workspace_invitations SET accepted_at = now() WHERE id = inv.id;
  RETURN inv.workspace_id;
END $function$;

-- 3. lookup_invitation: restrict to the invited email (defense-in-depth)
CREATE OR REPLACE FUNCTION public.lookup_invitation(_token text)
RETURNS TABLE(id uuid, email text, role workspace_role, workspace_id uuid, workspace_name text, accepted_at timestamp with time zone, expires_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT i.id, i.email, i.role, i.workspace_id, w.name, i.accepted_at, i.expires_at
  FROM public.workspace_invitations i
  JOIN public.workspaces w ON w.id = i.workspace_id
  WHERE i.token = _token
    AND lower(i.email) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''));
$function$;

-- 4. workspace_invitations: allow invited users to read their own invite by email
DROP POLICY IF EXISTS wi_select_by_email ON public.workspace_invitations;
CREATE POLICY wi_select_by_email ON public.workspace_invitations
  FOR SELECT TO authenticated
  USING (
    accepted_at IS NULL
    AND lower(email) = lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
  );

-- 5. Fix function with mutable search_path
CREATE OR REPLACE FUNCTION public.validate_campaign_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
begin
  if new.status in ('active','completed') and (new.start_date is null or new.end_date is null) then
    raise exception 'Cannot set status to % without start and end dates.', new.status;
  end if;
  if new.status = 'completed' and new.end_date > current_date then
    raise exception 'Cannot mark campaign as completed before its end date (%).', new.end_date;
  end if;
  return new;
end $function$;

-- 6. Storage: restrict campaign-files to the uploader's own folder (path[1] = uid)
DROP POLICY IF EXISTS "report attachments read" ON storage.objects;
DROP POLICY IF EXISTS "report attachments write" ON storage.objects;
DROP POLICY IF EXISTS "report attachments delete own" ON storage.objects;
DROP POLICY IF EXISTS "report attachments update own" ON storage.objects;

CREATE POLICY "campaign files select own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campaign-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "campaign files insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-files'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "campaign files update own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-files'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'campaign-files'
  AND owner = auth.uid()
);

CREATE POLICY "campaign files delete own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-files'
  AND owner = auth.uid()
);
