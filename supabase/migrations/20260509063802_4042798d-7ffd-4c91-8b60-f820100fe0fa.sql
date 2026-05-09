
-- Roles enum
create type public.workspace_role as enum ('owner','admin','editor','viewer');

-- Workspaces
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  role public.workspace_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role public.workspace_role not null default 'editor',
  token text not null unique default encode(gen_random_bytes(24),'hex'),
  invited_by uuid not null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.workspace_members(user_id);
create index on public.workspace_invitations(email);

-- Helper functions (security definer to avoid RLS recursion)
create or replace function public.is_workspace_member(_ws uuid, _user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members where workspace_id=_ws and user_id=_user);
$$;

create or replace function public.workspace_role_of(_ws uuid, _user uuid)
returns public.workspace_role language sql stable security definer set search_path=public as $$
  select role from public.workspace_members where workspace_id=_ws and user_id=_user;
$$;

create or replace function public.can_edit_workspace(_ws uuid, _user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members where workspace_id=_ws and user_id=_user and role in ('owner','admin','editor'));
$$;

create or replace function public.can_admin_workspace(_ws uuid, _user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.workspace_members where workspace_id=_ws and user_id=_user and role in ('owner','admin'));
$$;

-- RLS for workspaces
alter table public.workspaces enable row level security;
create policy ws_select on public.workspaces for select using (public.is_workspace_member(id, auth.uid()));
create policy ws_insert on public.workspaces for insert with check (auth.uid() = owner_id);
create policy ws_update on public.workspaces for update using (public.can_admin_workspace(id, auth.uid()));
create policy ws_delete on public.workspaces for delete using (auth.uid() = owner_id);

alter table public.workspace_members enable row level security;
create policy wm_select on public.workspace_members for select using (public.is_workspace_member(workspace_id, auth.uid()));
create policy wm_insert on public.workspace_members for insert with check (public.can_admin_workspace(workspace_id, auth.uid()) or auth.uid() = user_id);
create policy wm_update on public.workspace_members for update using (public.can_admin_workspace(workspace_id, auth.uid()));
create policy wm_delete on public.workspace_members for delete using (public.can_admin_workspace(workspace_id, auth.uid()) or auth.uid() = user_id);

alter table public.workspace_invitations enable row level security;
create policy wi_select on public.workspace_invitations for select using (public.can_admin_workspace(workspace_id, auth.uid()));
create policy wi_insert on public.workspace_invitations for insert with check (public.can_admin_workspace(workspace_id, auth.uid()));
create policy wi_delete on public.workspace_invitations for delete using (public.can_admin_workspace(workspace_id, auth.uid()));

-- Add workspace_id to campaigns
alter table public.campaigns add column workspace_id uuid;

-- Backfill: create a personal workspace per existing user
do $$
declare r record;
declare ws_id uuid;
begin
  for r in select distinct owner_id from public.campaigns where workspace_id is null loop
    insert into public.workspaces(name, owner_id) values ('Personal workspace', r.owner_id) returning id into ws_id;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws_id, r.owner_id, 'owner');
    update public.campaigns set workspace_id = ws_id where owner_id = r.owner_id and workspace_id is null;
  end loop;
end $$;

-- Also backfill workspaces for existing profiles without campaigns
do $$
declare r record;
declare ws_id uuid;
begin
  for r in select id from public.profiles p where not exists (select 1 from public.workspace_members m where m.user_id = p.id) loop
    insert into public.workspaces(name, owner_id) values ('Personal workspace', r.id) returning id into ws_id;
    insert into public.workspace_members(workspace_id, user_id, role) values (ws_id, r.id, 'owner');
  end loop;
end $$;

-- Update campaigns RLS to include workspace members
drop policy campaigns_select_own_or_admin on public.campaigns;
drop policy campaigns_insert_own on public.campaigns;
drop policy campaigns_update_own on public.campaigns;
drop policy campaigns_delete_own on public.campaigns;

create policy campaigns_select on public.campaigns for select
  using (auth.uid() = owner_id or public.is_workspace_member(workspace_id, auth.uid()) or has_role(auth.uid(),'admin'));
create policy campaigns_insert on public.campaigns for insert
  with check (auth.uid() = owner_id and (workspace_id is null or public.can_edit_workspace(workspace_id, auth.uid())));
create policy campaigns_update on public.campaigns for update
  using (auth.uid() = owner_id or public.can_edit_workspace(workspace_id, auth.uid()));
create policy campaigns_delete on public.campaigns for delete
  using (auth.uid() = owner_id or public.can_admin_workspace(workspace_id, auth.uid()));

-- Update influencers RLS to allow workspace members
drop policy influencers_select on public.influencers;
drop policy influencers_insert on public.influencers;
drop policy influencers_update on public.influencers;
drop policy influencers_delete on public.influencers;

create policy influencers_select on public.influencers for select using (
  exists(select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.is_workspace_member(c.workspace_id, auth.uid())))
);
create policy influencers_insert on public.influencers for insert with check (
  exists(select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.can_edit_workspace(c.workspace_id, auth.uid())))
);
create policy influencers_update on public.influencers for update using (
  exists(select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.can_edit_workspace(c.workspace_id, auth.uid())))
);
create policy influencers_delete on public.influencers for delete using (
  exists(select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.can_edit_workspace(c.workspace_id, auth.uid())))
);

-- Update reports RLS
drop policy reports_select_own_or_admin on public.reports;
drop policy reports_insert_own on public.reports;
drop policy reports_update_own on public.reports;
drop policy reports_delete_own on public.reports;

create policy reports_select on public.reports for select using (
  auth.uid() = owner_id or exists(select 1 from public.campaigns c where c.id = campaign_id and public.is_workspace_member(c.workspace_id, auth.uid()))
);
create policy reports_insert on public.reports for insert with check (
  auth.uid() = owner_id and exists(select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.can_edit_workspace(c.workspace_id, auth.uid())))
);
create policy reports_update on public.reports for update using (
  auth.uid() = owner_id or exists(select 1 from public.campaigns c where c.id = campaign_id and public.can_edit_workspace(c.workspace_id, auth.uid()))
);
create policy reports_delete on public.reports for delete using (
  auth.uid() = owner_id or exists(select 1 from public.campaigns c where c.id = campaign_id and public.can_admin_workspace(c.workspace_id, auth.uid()))
);

-- Add ai_summary to reports
alter table public.reports add column ai_summary text;

-- Report attachments (screenshots)
create table public.report_attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  uploader_id uuid not null,
  file_path text not null,
  file_name text not null,
  content_type text,
  created_at timestamptz not null default now()
);
alter table public.report_attachments enable row level security;
create policy ra_select on public.report_attachments for select using (
  exists(select 1 from public.reports r join public.campaigns c on c.id = r.campaign_id
         where r.id = report_id and (r.owner_id = auth.uid() or public.is_workspace_member(c.workspace_id, auth.uid())))
);
create policy ra_insert on public.report_attachments for insert with check (
  uploader_id = auth.uid() and exists(select 1 from public.reports r join public.campaigns c on c.id = r.campaign_id
         where r.id = report_id and (r.owner_id = auth.uid() or public.can_edit_workspace(c.workspace_id, auth.uid())))
);
create policy ra_delete on public.report_attachments for delete using (
  uploader_id = auth.uid() or exists(select 1 from public.reports r join public.campaigns c on c.id = r.campaign_id
         where r.id = report_id and public.can_admin_workspace(c.workspace_id, auth.uid()))
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(user_id, read_at);
alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select using (auth.uid() = user_id);
create policy notif_update on public.notifications for update using (auth.uid() = user_id);
create policy notif_delete on public.notifications for delete using (auth.uid() = user_id);
create policy notif_insert on public.notifications for insert with check (auth.uid() = user_id);

-- Update handle_new_user to also create personal workspace
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare ws_id uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  insert into public.workspaces (name, owner_id) values ('Personal workspace', new.id) returning id into ws_id;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  return new;
end $$;

-- Notify on campaign status change
create or replace function public.notify_campaign_status_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (TG_OP = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.notifications(user_id, type, title, body, link)
    select wm.user_id, 'campaign_status', 'Campaign status updated',
           new.name || ' is now ' || new.status::text, '/campaigns/' || new.id::text
    from public.workspace_members wm where wm.workspace_id = new.workspace_id;
  end if;
  return new;
end $$;
create trigger campaigns_status_notify after update on public.campaigns
for each row execute function public.notify_campaign_status_change();

-- Storage bucket for report screenshots (reuse campaign-files but add per-bucket policies for report-attachments path)
create policy "report attachments read" on storage.objects for select
  using (bucket_id = 'campaign-files' and auth.uid() is not null);
create policy "report attachments write" on storage.objects for insert
  with check (bucket_id = 'campaign-files' and auth.uid() is not null);
create policy "report attachments delete own" on storage.objects for delete
  using (bucket_id = 'campaign-files' and owner = auth.uid());
