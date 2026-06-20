
-- UI preferences on profiles (per-user, syncs across devices)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Workspace activity log
CREATE TABLE IF NOT EXISTS public.workspace_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.workspace_activity TO authenticated;
GRANT ALL ON public.workspace_activity TO service_role;

ALTER TABLE public.workspace_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_activity_select"
  ON public.workspace_activity FOR SELECT
  TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "workspace_activity_insert"
  ON public.workspace_activity FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = actor_id AND public.is_workspace_member(workspace_id, auth.uid()));

CREATE INDEX IF NOT EXISTS workspace_activity_ws_created_idx
  ON public.workspace_activity(workspace_id, created_at DESC);
