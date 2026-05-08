
-- Enums
create type public.app_role as enum ('admin', 'user');
create type public.campaign_status as enum ('draft', 'active', 'completed', 'paused');
create type public.campaign_type as enum ('paid', 'organic');
create type public.report_type as enum ('paid', 'influencer', 'organic');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  company_name text,
  company_logo_url text,
  country text,
  bio text,
  avatar_url text,
  title text not null default 'Digital Marketer',
  social_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Roles (separate table to prevent privilege escalation)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

-- Campaigns
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  university_name text not null,
  client_country text,
  contact_person text,
  contact_email text,
  contact_phone text,
  name text not null,
  description text,
  objectives text,
  deliverables text,
  start_date date,
  end_date date,
  status public.campaign_status not null default 'draft',
  type public.campaign_type not null default 'organic',
  paid_budget numeric,
  platforms text[] not null default '{}',
  uses_influencers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaigns enable row level security;
create index on public.campaigns(owner_id);
create index on public.campaigns(status);

-- Influencers
create table public.influencers (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  handle text,
  platform text,
  followers integer,
  deliverable_type text,
  cost numeric,
  engagement_rate numeric,
  created_at timestamptz not null default now()
);
alter table public.influencers enable row level security;
create index on public.influencers(campaign_id);

-- Reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  type public.report_type not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create index on public.reports(campaign_id);
create index on public.reports(owner_id);

-- Helper to check campaign ownership for child tables
create or replace function public.owns_campaign(_campaign_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.campaigns where id = _campaign_id and owner_id = _user_id);
$$;

-- RLS Policies
-- profiles
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (auth.uid() = id or public.has_role(auth.uid(), 'admin'));
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- user_roles (read own, admin manages)
create policy "roles_select_own_or_admin" on public.user_roles
  for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "roles_admin_write" on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- campaigns
create policy "campaigns_select_own_or_admin" on public.campaigns
  for select using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));
create policy "campaigns_insert_own" on public.campaigns
  for insert with check (auth.uid() = owner_id);
create policy "campaigns_update_own" on public.campaigns
  for update using (auth.uid() = owner_id);
create policy "campaigns_delete_own" on public.campaigns
  for delete using (auth.uid() = owner_id);

-- influencers (via campaign ownership)
create policy "influencers_select" on public.influencers
  for select using (public.owns_campaign(campaign_id, auth.uid()) or public.has_role(auth.uid(), 'admin'));
create policy "influencers_insert" on public.influencers
  for insert with check (public.owns_campaign(campaign_id, auth.uid()));
create policy "influencers_update" on public.influencers
  for update using (public.owns_campaign(campaign_id, auth.uid()));
create policy "influencers_delete" on public.influencers
  for delete using (public.owns_campaign(campaign_id, auth.uid()));

-- reports
create policy "reports_select_own_or_admin" on public.reports
  for select using (auth.uid() = owner_id or public.has_role(auth.uid(), 'admin'));
create policy "reports_insert_own" on public.reports
  for insert with check (auth.uid() = owner_id and public.owns_campaign(campaign_id, auth.uid()));
create policy "reports_update_own" on public.reports
  for update using (auth.uid() = owner_id);
create policy "reports_delete_own" on public.reports
  for delete using (auth.uid() = owner_id);

-- Auto-create profile + default role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.user_roles (user_id, role) values (new.id, 'user');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at triggers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns
  for each row execute function public.touch_updated_at();

-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('company-logos', 'company-logos', true),
  ('campaign-files', 'campaign-files', false)
on conflict (id) do nothing;

-- Storage policies: public read for avatars + logos, owner-scoped writes (folder = user id)
create policy "avatars_public_read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars_user_write" on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_update" on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "avatars_user_delete" on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "logos_public_read" on storage.objects for select using (bucket_id = 'company-logos');
create policy "logos_user_write" on storage.objects for insert
  with check (bucket_id = 'company-logos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "logos_user_update" on storage.objects for update
  using (bucket_id = 'company-logos' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "logos_user_delete" on storage.objects for delete
  using (bucket_id = 'company-logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "files_owner_read" on storage.objects for select
  using (bucket_id = 'campaign-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "files_owner_write" on storage.objects for insert
  with check (bucket_id = 'campaign-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "files_owner_update" on storage.objects for update
  using (bucket_id = 'campaign-files' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "files_owner_delete" on storage.objects for delete
  using (bucket_id = 'campaign-files' and auth.uid()::text = (storage.foldername(name))[1]);
