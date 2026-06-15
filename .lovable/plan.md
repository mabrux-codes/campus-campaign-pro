## 1. Live security findings (admins/owners)

**DB migration**
- New table `public.security_findings`: `id`, `workspace_id` (nullable for project-wide), `severity` (enum: low/medium/high/critical), `title`, `description`, `source` (text, e.g. 'wiz','supabase','manual'), `status` (open/resolved/ignored), `created_at`, `acknowledged_by` (uuid[]).
- GRANTs: `authenticated` SELECT/UPDATE; `service_role` ALL. No `anon`.
- RLS: SELECT/UPDATE only when `can_admin_workspace(workspace_id, auth.uid())` (or `workspace_id IS NULL` for global, restricted to admins of any workspace via `has_role` check — fall back to per-workspace).
- Enable realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE public.security_findings`.

**Frontend**
- Extend `src/lib/notifications.tsx` (or new `src/lib/security-alerts.tsx`) to subscribe to `security_findings` inserts when current user is admin/owner in any workspace; on `high|critical` insert → sonner toast (red, persistent) + beep.
- New unread badge: count of `severity in ('high','critical') AND status='open' AND NOT (auth.uid() = ANY(acknowledged_by))`.
- In `src/components/app-sidebar.tsx`, render a red dot/number badge next to the Settings nav item using that count.
- In `src/routes/_authenticated/settings.tsx`, add a "Security findings" card (admins only) listing open findings with Acknowledge / Mark resolved buttons; acknowledging appends `auth.uid()` to `acknowledged_by`.

## 2. Google sign-in + provider status on Settings

- Call `supabase--configure_social_auth` with `providers: ["google"]` (keep email enabled).
- Add "Sign in with Google" button on `src/routes/login.tsx` and `src/routes/signup.tsx` using `lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })` per the Lovable Cloud managed flow.
- On `settings.tsx`, add a "Connected accounts" card showing Google + Apple status. Source: `supabase.auth.getUser()` → `user.identities[]`; row for each provider with "Connected" badge if present, else a "Connect" button (Google → `linkIdentity({ provider:'google' })`; Apple → disabled placeholder "Not configured" since Apple is not enabled this turn).

## 3. Influencer availability tied to active campaigns

**DB migration**
- New table `public.campaign_influencers`: `id`, `campaign_id` FK→campaigns (cascade), `influencer_profile_id` FK→influencer_profiles (cascade), `workspace_id`, `created_at`. Unique(campaign_id, influencer_profile_id).
- GRANTs + RLS by `is_workspace_member(workspace_id, auth.uid())` for SELECT and `can_edit_workspace` for write.

**Frontend**
- On `campaigns/$id.tsx`, add an "Influencers" section where editors pick from available profiles (filtered: not already assigned to any campaign with status='active'); insert into `campaign_influencers`.
- On `influencers.tsx`, the main list filters out any profile that has a row in `campaign_influencers` joined to a campaign with `status='active'`. A separate tab "In active campaigns" shows them read-only. Completed/cancelled/draft/paused campaigns do NOT hide the influencer (so they become available again automatically once status flips to `completed`).

## 4. Average engagement from Instagram stories reports

**Report form change (`reports/new.tsx`)**
- For `influencer` type, when `platform = "Instagram"` and add a new toggle "Instagram Stories": render stories-specific fields: `impressions` (req), `replies` (req), `link_clicks`, `sticker_taps`, plus existing `influencer` link.
- Add a required `influencer_profile_id` select (workspace influencers) on `influencer` reports; persisted into `reports.data.influencer_profile_id`.

**Computation**
- New helper `src/lib/influencer-stats.ts`:
  - For each report where `type='influencer'` AND `data.platform='Instagram'` AND `data.format='stories'` AND `data.influencer_profile_id = X`:
    `rate = (replies + link_clicks + sticker_taps) / impressions` (skip if impressions <= 0).
  - `avg_engagement = mean(rate)`.
- Display on the influencer profile card and the activity dialog in `influencers.tsx` (e.g. "Avg story engagement: 4.2% (n=7)").

## Technical notes

- Migrations order: (a) `security_findings` + realtime, (b) `campaign_influencers`. Each follows CREATE → GRANT → RLS → POLICY.
- Realtime: rely on RLS for `security_findings` so non-admin users don't receive payloads.
- No new server functions required; all reads/writes use the authenticated browser client respecting RLS.
- `acknowledged_by uuid[]` updated with `array_append` via supabase update.
- Apple sign-in is NOT being enabled; the Settings UI just labels it "Not configured" — wire a real flow later when requested.