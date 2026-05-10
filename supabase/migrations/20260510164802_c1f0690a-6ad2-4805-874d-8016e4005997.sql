
-- 1. Restore execute privileges on helper functions used inside RLS policies.
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.owns_campaign(uuid, uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.workspace_role_of(uuid, uuid) to authenticated;
grant execute on function public.can_edit_workspace(uuid, uuid) to authenticated;
grant execute on function public.can_admin_workspace(uuid, uuid) to authenticated;

-- 2. Status transition validation trigger
create or replace function public.validate_campaign_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status in ('active','completed') and (new.start_date is null or new.end_date is null) then
    raise exception 'Cannot set status to % without start and end dates.', new.status;
  end if;
  if new.status = 'completed' and new.end_date > current_date then
    raise exception 'Cannot mark campaign as completed before its end date (%).', new.end_date;
  end if;
  return new;
end $$;

drop trigger if exists trg_validate_campaign_status on public.campaigns;
create trigger trg_validate_campaign_status
  before insert or update of status, start_date, end_date on public.campaigns
  for each row execute function public.validate_campaign_status();

-- 3. End-date reminder notifier (called by cron via api/public/hooks/check-due-reports)
create or replace function public.notify_due_campaign_reports()
returns integer language plpgsql security definer set search_path = public as $$
declare
  inserted int := 0;
begin
  with due as (
    select c.id, c.name, c.workspace_id, c.owner_id
    from public.campaigns c
    where c.end_date is not null
      and c.end_date <= current_date
      and c.status <> 'completed'
      and not exists (select 1 from public.reports r where r.campaign_id = c.id)
  ),
  recipients as (
    select due.id as campaign_id, due.name, wm.user_id
    from due
    join public.workspace_members wm on wm.workspace_id = due.workspace_id
    union
    select due.id, due.name, due.owner_id
    from due
    where due.workspace_id is null
  ),
  ins as (
    insert into public.notifications(user_id, type, title, body, link)
    select r.user_id, 'report_due',
           'Report due: ' || r.name,
           'This campaign has reached its end date. Submit its performance report.',
           '/campaigns/' || r.campaign_id::text
    from recipients r
    where not exists (
      select 1 from public.notifications n
      where n.user_id = r.user_id
        and n.type = 'report_due'
        and n.link = '/campaigns/' || r.campaign_id::text
        and n.created_at > now() - interval '3 days'
    )
    returning 1
  )
  select count(*) into inserted from ins;
  return inserted;
end $$;

revoke execute on function public.notify_due_campaign_reports() from public, anon, authenticated;
