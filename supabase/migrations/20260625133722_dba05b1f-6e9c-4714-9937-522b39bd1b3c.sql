DROP POLICY IF EXISTS ws_insert ON public.workspaces;
CREATE POLICY ws_insert
  ON public.workspaces
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'workspace name required';
  END IF;

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (btrim(p_name), v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_id, v_uid, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_workspace(text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;