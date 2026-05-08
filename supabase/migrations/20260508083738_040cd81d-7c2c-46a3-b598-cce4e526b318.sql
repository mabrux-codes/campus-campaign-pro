
-- Fix search_path on touch function
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- Restrict storage.objects SELECT for avatars/logos to owner only (public CDN URLs still work)
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "logos_public_read" on storage.objects;

create policy "avatars_owner_list" on storage.objects for select
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "logos_owner_list" on storage.objects for select
  using (bucket_id = 'company-logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Revoke execute from public/anon/authenticated on internal security definer helpers
revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.owns_campaign(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
