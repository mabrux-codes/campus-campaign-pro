# Plan

## 1. Dashboard — Upcoming + Pending reports
In `src/routes/_authenticated/dashboard.tsx`:
- Keep current "Upcoming reports" card (campaigns with end_date in the future).
- Add a second "Pending reports" card using existing `usePendingReports()` hook — lists campaigns past end_date with no submitted report. Each item links to `/campaigns/$id` with a "Submit report" CTA.

## 2. Campaign detail — Dual currency budget
In `src/routes/_authenticated/campaigns/$id.tsx`, under the "Paid campaign details" section:
- Display total ads budget in the campaign's set currency **and** KES equivalent on a second line (e.g. `$1,200  ≈ KSh 154,800`).
- If the campaign currency is already KES, show only the KES value (no conversion).
- Use existing `src/lib/fx.ts` for conversion.

## 3. Influencer profiles — Avatar upload + multi-platform
- Schema: add `platforms jsonb default '[]'` to `influencer_profiles` storing `[{platform, handle, followers}, ...]`. Keep legacy single columns for backward compat (read both, prefer new array).
- `src/routes/_authenticated/influencers.tsx` EditInfluencerDialog:
  - Replace avatar URL field with drag-and-drop / click-to-upload using existing `avatars` storage bucket (re-using the profile pattern).
  - Replace single platform/handle/followers trio with a repeatable list: add/remove rows, each with platform dropdown, handle, followers count.
- "View activity" button on each card opens a dialog listing campaigns the influencer is linked to (via `influencers.profile_id`) grouped into Ongoing (status active) and Done (completed). Each row links to the campaign.

## 4. Reports — Hide submit button after submission
In `src/routes/_authenticated/campaigns/$id.tsx`, conditionally render the "Submit report" button only when no report exists for the campaign (already query reports there; gate the button on `reports.length === 0`).

## 5. Analytics — Country chart from campaign selection
Already pulls `client_country` from `campaigns`. Fix: map raw country code/name through `src/lib/countries.ts` to show the flag + readable name, and filter out null/empty. No data source change.

## 6. Profile — Phone with country code
- Add `bun add react-phone-number-input` (lightweight, has all country dial codes + flags).
- In `src/routes/_authenticated/profile.tsx`, replace plain phone Input with `<PhoneInput international defaultCountry={...} />`. Store full E.164 string in `profiles.phone`.

## 7. Workspace switcher — Move/transfer admin-only
In `src/components/workspace-switcher.tsx`:
- Show all workspaces the user belongs to (already does).
- For each workspace where the user's role is `owner` or `admin`, allow it to be selected/switched (current behavior already switches). Clarify wording — "Switch" for member workspaces, indicate role badge. The DB already enforces admin-only edits via `can_admin_workspace`.
- No schema change needed — switching `current` workspace already scopes campaigns globally via `useWorkspace()`.

## 8. Sidebar branding — Org name + logo
In `src/components/app-sidebar.tsx` (and wherever `BrandLockup` is used in the sidebar header):
- Replace `BrandLockup` in the sidebar with the current user's `profiles.company_name` (fallback "Lumen") and `profiles.company_logo_url` rendered as a PNG `<img>` (fallback `BrandMark` icon).
- Read from a small `useQuery(["profile", user.id])` or extend an existing profile context.

## Technical notes
- New dep: `react-phone-number-input` (~30kB, edge-safe, pure JS).
- One migration: `ALTER TABLE influencer_profiles ADD COLUMN platforms jsonb NOT NULL DEFAULT '[]'::jsonb;`
- Avatar uploads reuse `avatars` bucket; path `influencers/<workspace_id>/<id>-<filename>`.
- FX conversion is already cached in `src/lib/fx.ts` — no new API.

Ready to switch to build mode and implement?
