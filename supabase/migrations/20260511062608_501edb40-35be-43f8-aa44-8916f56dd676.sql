
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD'
  CHECK (currency IN ('USD','GBP','KES','AUD','CAD'));

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.create_workspace(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ws_id uuid; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Workspace name is required'; END IF;
  INSERT INTO public.workspaces(name, owner_id) VALUES (trim(p_name), uid) RETURNING id INTO ws_id;
  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES (ws_id, uid, 'owner');
  RETURN ws_id;
END $$;

REVOKE ALL ON FUNCTION public.create_workspace(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_workspace(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.derive_campaign_status(_start date, _end date, _current public.campaign_status)
RETURNS public.campaign_status
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _current IN ('paused','cancelled') THEN _current
    WHEN _start IS NULL OR _end IS NULL THEN COALESCE(_current,'draft'::public.campaign_status)
    WHEN current_date < _start THEN 'draft'::public.campaign_status
    WHEN current_date > _end THEN 'completed'::public.campaign_status
    ELSE 'active'::public.campaign_status
  END
$$;

CREATE OR REPLACE FUNCTION public.apply_auto_campaign_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('paused','cancelled') THEN
    NEW.status := public.derive_campaign_status(NEW.start_date, NEW.end_date, NEW.status);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_apply_auto_status ON public.campaigns;
CREATE TRIGGER trg_apply_auto_status
BEFORE INSERT OR UPDATE OF start_date, end_date, status ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.apply_auto_campaign_status();

CREATE OR REPLACE FUNCTION public.refresh_campaign_statuses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n int;
BEGIN
  WITH upd AS (
    UPDATE public.campaigns
    SET status = public.derive_campaign_status(start_date, end_date, status)
    WHERE status NOT IN ('paused','cancelled')
      AND start_date IS NOT NULL AND end_date IS NOT NULL
      AND status IS DISTINCT FROM public.derive_campaign_status(start_date, end_date, status)
    RETURNING 1
  ) SELECT count(*) INTO n FROM upd;
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.refresh_campaign_statuses() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN PERFORM cron.unschedule('refresh-campaign-statuses'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('refresh-campaign-statuses','5 0 * * *', $$ SELECT public.refresh_campaign_statuses(); $$);

SELECT public.refresh_campaign_statuses();
