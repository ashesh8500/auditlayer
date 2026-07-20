# Profile: account-centric-v01

Source of truth = the `accounts` row, NOT the audit list. Returning user comes for configured accounts.

## Prod truth (do not re-verify blindly)
Migrations 0026_account_ownership + 0027_research_cache APPLIED to linked Supabase. Tables exist, 0 rows until next SUCCESS audit fills them.
Tables: accounts, account_progression, instagram_connections, audits(account_id, force_refresh).

## accounts columns (existing)
id, user_id, handle, platform, display_name, avatar_url, last_researched_at, research_snapshot, ig_metrics_snapshot, cache_valid_until
## 0028 ADDS
bio, niche, goals, voice_notes text · competitors text[] default '{}' · memory jsonb default '{}' · ig_connection_id uuid → instagram_connections
RLS: insert/update/delete WHERE auth.uid()=user_id. Down: 0028_down.sql.

## UX flow
/accounts (grid AccountCard: @handle, platform, HealthDot connection, latest score+Δ, last audit date, New-audit btn)
/accounts/[id]?tab=overview|audits|progression|memory  (audits newest→oldest; progression = inline SVG sparkline from account_progression, no deps)
/accounts/[id]/settings (memory editor + connection health + cache: last_researched_at, cache_valid_until, Invalidate btn)
/audits/new?account_id= (prefill handle/platform/memory, chip + HealthDot, cache badge "Research from DATE", force_refresh toggle)

## Writer
worker _link_account_and_progression on success (already exists, pipeline.py:555). Extend: set display_name from ig profile, ig_connection_id if handle matches.
Frontend reads via (supabase as any).from("accounts") — AVOID gen-types loop that broke 12 files before.